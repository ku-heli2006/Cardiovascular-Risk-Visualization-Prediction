"""Soft-voting ensemble of the three classical models (averages their probabilities)."""
from sklearn.ensemble import VotingClassifier
from .base_model import BaseModel
from .logistic_model import LogisticModel
from .model_registry import register
from .random_forest_model import RandomForestModel
from .xgboost_model import XGBoostModel


@register
class SoftVotingEnsemble(BaseModel):
    name = "ensemble"
    needs_scaling = True       # scaling is harmless for the tree members

    def build(self, seed):
        return VotingClassifier([("lr", LogisticModel().build(seed)), ("rf", RandomForestModel().build(seed)),
                                 ("xgb", XGBoostModel().build(seed))], voting="soft", n_jobs=1)
