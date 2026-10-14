"""Model selection from validation evidence + human-readable report. Nothing is hardcoded."""
from __future__ import annotations
import pandas as pd
from .cross_validation import BASELINE
from .metrics import METRICS


def select_best(results: pd.DataFrame) -> dict[str, str]:
    """Per target: highest mean ROC-AUC, ties broken by F1. Baseline is never eligible."""
    best = {}
    for t, g in results[results.model != BASELINE].groupby("target"):
        g = g.sort_values(["roc_auc_mean", "f1_mean"], ascending=False)
        best[t] = g.iloc[0]["model"]
    return best


def to_markdown(results: pd.DataFrame, selected: dict[str, str]) -> str:
    out = ["# Model evaluation (repeated stratified CV; mean ± std over folds)\n"]
    for t, g in results.groupby("target", sort=False):
        out.append(f"\n## {t.upper()}  — selected: **{selected.get(t, 'n/a')}**\n")
        cols = [m for m in METRICS if m + "_mean" in g.columns]
        out.append("| Model | " + " | ".join(m.replace("_", "-") for m in cols) + " |")
        out.append("|---|" + "---|" * len(cols))
        real = g[g.model != BASELINE]
        top = real.sort_values("roc_auc_mean", ascending=False).iloc[0] if len(real) else None
        for _, r in g.iterrows():
            cells = " | ".join(f"{r[m + '_mean']:.3f} ± {r[m + '_std']:.3f}" for m in cols)
            tie = ""
            if top is not None and r["model"] != BASELINE and r["model"] != top["model"]:
                se = top["roc_auc_std"] / (top["n_folds"] ** 0.5)
                if r["roc_auc_mean"] >= top["roc_auc_mean"] - se:
                    tie = " (≈ tied with best)"
            out.append(f"| {r['model']}{tie} | {cells} |")
    out.append("\nSelection rule: highest mean ROC-AUC (ties by F1). Selection is made on the same CV "
               "used for reporting, so scores are mildly optimistic; treat differences smaller than "
               "one std as ties ('≈ tied' = within one standard error of the best AUC). Brier score: lower is better. "
               "The majority baseline is shown for reference only.")
    return "\n".join(out)
