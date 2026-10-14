"""Dataset sanity checks run before any training."""
from __future__ import annotations
import pandas as pd
from ..config import TARGETS


def validate_dataset(X: pd.DataFrame, y: pd.DataFrame) -> dict:
    report = {"n_rows": len(X), "n_features": X.shape[1], "missing_by_column": {}, "targets": {}}
    miss = X.isna().sum()
    report["missing_by_column"] = {c: int(n) for c, n in miss.items() if n > 0}
    for t in y.columns:
        s = y[t]
        if s.isna().any():
            raise ValueError(f"Target '{t}' has {int(s.isna().sum())} missing labels")
        pos = int(s.sum())
        report["targets"][t] = {"positives": pos, "negatives": len(s) - pos,
                                "prevalence": round(pos / len(s), 3)}
        if min(pos, len(s) - pos) < 10:
            report.setdefault("warnings", []).append(f"{t}: fewer than 10 samples in one class")
    report["label_columns"] = dict(getattr(y, "attrs", {}).get("label_columns", {}))
    report["available_targets"] = list(y.columns)
    report["missing_targets"] = [t for t in TARGETS if t not in y.columns]
    return report
