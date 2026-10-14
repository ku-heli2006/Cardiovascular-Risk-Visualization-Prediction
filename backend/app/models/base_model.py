"""Interface every model implements. Add a new model = subclass + @register. Nothing else changes."""
from __future__ import annotations
from abc import ABC, abstractmethod
import pandas as pd
from sklearn.pipeline import Pipeline
from ..preprocessing.pipeline import build_preprocessor


class BaseModel(ABC):
    name: str = "base"
    needs_scaling: bool = False     # drives the preprocessor (scale only where it matters)
    tree_based: bool = False        # lets the explainer pick TreeExplainer vs a generic one
    opt_in: bool = False            # True = slow models, only trained when asked for (--models all / by name)

    @abstractmethod
    def build(self, seed: int):
        """Return an UNFITTED sklearn-compatible classifier exposing predict_proba."""


def make_pipeline(model: BaseModel, X: pd.DataFrame, seed: int) -> Pipeline:
    """preprocessor + classifier in ONE estimator, so CV refits both inside each training fold."""
    return Pipeline([("prep", build_preprocessor(X, scale=model.needs_scaling)),
                     ("clf", model.build(seed))])
