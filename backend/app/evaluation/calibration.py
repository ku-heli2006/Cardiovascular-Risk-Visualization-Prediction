"""Does a predicted 80% really mean ~80%? Reliability of the out-of-fold probabilities.
Each patient is scored only by models that never saw them (cross-validation), so this is honest evidence about
the quality of the risk estimate, not just its ranking. Nothing here is hardcoded."""
from __future__ import annotations
import math
import numpy as np

EDGES = (0.0, 0.2, 0.4, 0.6, 0.8, 1.0)


def wilson(k: int, n: int, z: float = 1.96) -> tuple[float, float]:
    """95% Wilson interval for a proportion (well behaved for small n)."""
    if n == 0:
        return (float("nan"), float("nan"))
    p = k / n
    d = 1 + z * z / n
    centre = (p + z * z / (2 * n)) / d
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (max(0.0, centre - half), min(1.0, centre + half))


def reliability_table(y, p, edges=EDGES) -> list[dict]:
    y, p = np.asarray(y).astype(int), np.asarray(p, dtype=float)
    rows = []
    for i, (lo, hi) in enumerate(zip(edges[:-1], edges[1:])):
        last = i == len(edges) - 2
        m = (p >= lo) & ((p <= hi) if last else (p < hi))
        n, k = int(m.sum()), int(y[m].sum())
        lo_ci, hi_ci = wilson(k, n)
        rows.append({"lo": lo, "hi": hi, "n": n, "positives": k,
                     "mean_predicted": float(p[m].mean()) if n else None,
                     "observed_rate": (k / n) if n else None,
                     "ci_low": lo_ci if n else None, "ci_high": hi_ci if n else None})
    return rows


def calibration_summary(y, p, model: str) -> dict:
    """Bins + expected calibration error (weighted gap between predicted and observed) + Brier score."""
    y, p = np.asarray(y).astype(int), np.asarray(p, dtype=float)
    bins = reliability_table(y, p)
    n = len(y)
    ece = sum(b["n"] / n * abs(b["mean_predicted"] - b["observed_rate"]) for b in bins if b["n"])
    return {"model": model, "n_patients": n, "brier": float(np.mean((p - y) ** 2)), "ece": float(ece),
            "bins": bins,
            "note": "Out-of-fold cross-validation predictions (each patient scored by models that never saw "
                    "them), averaged over repeats. An estimate from one 303-patient dataset, not a guarantee."}
