"""Repeated stratified CV. Preprocessing is inside the pipeline, so it is refit per training fold."""
from __future__ import annotations
import numpy as np
import pandas as pd
from sklearn.base import clone
from sklearn.dummy import DummyClassifier
from sklearn.model_selection import RepeatedStratifiedKFold
from ..config import CV_FOLDS, CV_REPEATS, RANDOM_SEED, TARGETS
from ..models.base_model import make_pipeline
from ..models.model_registry import default_models, get_model
from .metrics import METRICS, compute_metrics

BASELINE = "majority_baseline"


def evaluate_models(X: pd.DataFrame, y: pd.DataFrame, models: list[str] | None = None,
                    targets: list[str] | None = None, folds: int = CV_FOLDS,
                    repeats: int = CV_REPEATS, seed: int = RANDOM_SEED, progress=None) -> pd.DataFrame:
    """Return long table: target, model, <metric>_mean, <metric>_std, n_folds.
    The out-of-fold probabilities (one per patient, averaged over repeats) are kept in result.attrs['oof'][(target, model)].
    progress(target, model, row) is called after each model finishes (used for terminal feedback)."""
    models, targets = models or default_models(), targets or list(y.columns)
    oof = {}
    cv = RepeatedStratifiedKFold(n_splits=folds, n_repeats=repeats, random_state=seed)
    rows = []
    for t in targets:
        yt = y[t].astype(int).to_numpy()
        splits = list(cv.split(X, yt))              # identical splits for every model -> fair comparison
        for name in [*models, BASELINE]:
            per_fold = []
            acc, cnt = np.zeros(len(yt)), np.zeros(len(yt))
            for tr, te in splits:
                if name == BASELINE:
                    est = DummyClassifier(strategy="prior").fit(X.iloc[tr], yt[tr])
                    p = est.predict_proba(X.iloc[te])[:, 1]
                else:
                    pipe = make_pipeline(get_model(name), X, seed)
                    pipe.fit(X.iloc[tr], yt[tr])
                    p = pipe.predict_proba(X.iloc[te])[:, 1]
                per_fold.append(compute_metrics(yt[te], p))
                acc[te] += p
                cnt[te] += 1
            df = pd.DataFrame(per_fold)
            row = {"target": t, "model": name, "n_folds": len(per_fold)}
            for m in METRICS:
                row[f"{m}_mean"], row[f"{m}_std"] = df[m].mean(), df[m].std(ddof=1)
            rows.append(row)
            oof[(t, name)] = acc / np.maximum(cnt, 1)
            if progress:
                progress(t, name, row)
    out = pd.DataFrame(rows)
    out.attrs["oof"] = oof
    return out
