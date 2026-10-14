"""Hyper-parameter-tuned variants. The search runs INSIDE each training fold (RandomizedSearchCV on the
training rows only), so cross-validating them is properly nested and the scores are not inflated by tuning.
They are slow, so they are opt-in:  python -m app.models.trainer --models all"""
from scipy.stats import loguniform, randint, uniform
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import RandomizedSearchCV, StratifiedKFold
from xgboost import XGBClassifier
from .base_model import BaseModel
from .model_registry import register


def _search(estimator, space, seed, n_iter=10):
    return RandomizedSearchCV(estimator, space, n_iter=n_iter, scoring="roc_auc", refit=True, n_jobs=1,
                              cv=StratifiedKFold(3, shuffle=True, random_state=seed), random_state=seed)


@register
class XGBoostTuned(BaseModel):
    name = "xgboost_tuned"
    tree_based = True
    opt_in = True

    def build(self, seed):
        base = XGBClassifier(eval_metric="logloss", n_jobs=1, random_state=seed, verbosity=0)
        return _search(base, {"n_estimators": randint(80, 400), "max_depth": randint(2, 5),
                              "learning_rate": loguniform(0.02, 0.2), "subsample": uniform(0.6, 0.4),
                              "colsample_bytree": uniform(0.5, 0.5), "min_child_weight": randint(1, 7),
                              "reg_lambda": loguniform(1, 10)}, seed)


@register
class RandomForestTuned(BaseModel):
    name = "random_forest_tuned"
    tree_based = True
    opt_in = True

    def build(self, seed):
        base = RandomForestClassifier(class_weight="balanced", n_jobs=-1, random_state=seed)
        return _search(base, {"n_estimators": [200, 300], "max_depth": [None, 4, 6, 8],
                              "min_samples_leaf": [1, 2, 3, 5], "max_features": ["sqrt", "log2", 0.3]}, seed, 8)
