from __future__ import annotations
import numpy as np
from sklearn.metrics import (accuracy_score, brier_score_loss, f1_score, precision_score, recall_score,
                             roc_auc_score)

# brier = mean squared error of the probability (LOWER is better); it measures risk-estimate quality, not just ranking
METRICS = ["accuracy", "precision", "recall", "f1", "roc_auc", "brier"]


def compute_metrics(y_true, proba, threshold: float = 0.5) -> dict[str, float]:
    y_true = np.asarray(y_true).astype(int)
    pred = (np.asarray(proba) >= threshold).astype(int)
    return {
        "accuracy": accuracy_score(y_true, pred),
        "precision": precision_score(y_true, pred, zero_division=0),
        "recall": recall_score(y_true, pred, zero_division=0),
        "f1": f1_score(y_true, pred, zero_division=0),
        "roc_auc": roc_auc_score(y_true, proba) if len(set(y_true)) == 2 else float("nan"),
        "brier": brier_score_loss(y_true, np.clip(proba, 0, 1)),
    }
