"""Small neural network (deep-learning candidate). A bag of 7 tiny MLPs: averaging seeds stabilises
probabilities on a 303-row dataset. Whether it helps is decided by cross-validation, not assumed."""
from sklearn.ensemble import BaggingClassifier
from sklearn.neural_network import MLPClassifier
from .base_model import BaseModel
from .model_registry import register


@register
class MLPModel(BaseModel):
    name = "mlp"
    needs_scaling = True

    def build(self, seed):
        net = MLPClassifier(hidden_layer_sizes=(64, 32), alpha=0.05, early_stopping=True,
                            validation_fraction=0.15, n_iter_no_change=20, max_iter=800, random_state=seed)
        return BaggingClassifier(estimator=net, n_estimators=7, max_samples=0.9, random_state=seed, n_jobs=1)
