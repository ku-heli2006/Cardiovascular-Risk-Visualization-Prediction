"""SHAP explanations aggregated back to the ORIGINAL clinical features (one-hot columns are summed)."""
from __future__ import annotations
import joblib
import numpy as np
import pandas as pd
import shap
from ..config import TARGETS
from ..models.model_registry import get_model
from ..models.predictor import Predictor


def _positive_class(sv) -> np.ndarray:
    if isinstance(sv, list):
        sv = sv[-1]
    sv = np.asarray(sv)
    if sv.ndim == 3:
        sv = sv[:, :, -1]
    return sv[0]


def _base(ev) -> float:
    ev = np.atleast_1d(ev)
    return float(ev[-1])


def _owner(name: str, columns: list[str]) -> str:
    """Map a transformed column ('Sex_Male') back to its original column ('Sex')."""
    if name in columns:
        return name
    cands = [c for c in columns if name.startswith(c + "_")]
    return max(cands, key=len) if cands else name


class Explainer:
    def __init__(self, predictor: Predictor):
        self.p = predictor
        self._cache: dict = {}

    def _explainer(self, target: str):
        if target in self._cache:
            return self._cache[target]
        clf = self.p.pipes[target].named_steps["clf"]
        clf = getattr(clf, "best_estimator_", clf)          # tuned models wrap the real estimator in a search object
        bg = joblib.load(self.p.dir / target / "background.joblib")
        m = get_model(self.p.meta[target]["model"])
        if m.tree_based:
            ex = shap.TreeExplainer(clf)
        elif getattr(m, "name", "") == "logistic_regression":
            ex = shap.LinearExplainer(clf, bg)
        else:  # generic fallback for any future model
            f = lambda d: clf.predict_proba(pd.DataFrame(d, columns=bg.columns))[:, 1]
            ex = shap.KernelExplainer(f, shap.kmeans(bg, 10))
        self._cache[target] = ex
        return ex

    def explain(self, target: str, patient: dict, top_k: int = 15) -> dict:
        if target not in TARGETS:
            raise ValueError(f"Unknown target '{target}'")
        X, _ = self.p.to_frame(patient)
        pipe = self.p.pipes[target]
        Xt = pipe.named_steps["prep"].transform(X)
        ex = self._explainer(target)
        # each SHAP explainer type accepts different keyword arguments, so call it the way it expects
        if isinstance(ex, shap.KernelExplainer):           # generic models (ensemble, neural net, ...)
            sv = ex.shap_values(Xt, silent=True)
        elif isinstance(ex, shap.TreeExplainer):
            sv = ex.shap_values(Xt, check_additivity=False)
        else:                                              # LinearExplainer (logistic regression)
            sv = ex.shap_values(Xt)
        sv = _positive_class(sv)
        base = _base(ex.expected_value)
        prob = float(pipe.predict_proba(X)[0, 1])

        total = base + float(sv.sum())
        unit = "probability" if abs(total - prob) < 1e-3 else "log-odds"

        cols = self.p.schema["columns"]
        agg: dict[str, float] = {}
        for name, v in zip(Xt.columns, sv):
            k = _owner(name, cols)
            agg[k] = agg.get(k, 0.0) + float(v)
        denom = sum(abs(v) for v in agg.values()) or 1.0
        ordered = sorted(agg.items(), key=lambda kv: abs(kv[1]), reverse=True)

        def raw(c):
            v = X[c].iloc[0] if c in X.columns else None
            if v is None or (isinstance(v, float) and np.isnan(v)):
                return None, True
            return (v.item() if hasattr(v, "item") else v), False

        contribs = []
        for c, v in ordered[:top_k]:
            val, imputed = raw(c)
            contribs.append({"feature": c, "value": val, "imputed": imputed, "shap_value": round(v, 5),
                             "share": round(abs(v) / denom, 4),
                             "direction": "increases" if v >= 0 else "decreases"})
        return {"target": target, "model": self.p.meta[target]["model"], "unit": unit,
                "base_value": round(base, 5), "output_value": round(total, 5),
                "probability": round(prob, 5), "contributions": contribs,
                "other_features_total": round(sum(v for _, v in ordered[top_k:]), 5)}
