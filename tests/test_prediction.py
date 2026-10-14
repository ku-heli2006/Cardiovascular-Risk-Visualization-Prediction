import pytest
from app.config import TARGETS
from app.evaluation.cross_validation import BASELINE
from app.models.model_registry import get_model, list_models, register
from app.models.base_model import BaseModel
from app.models.predictor import Predictor
from app.models.trainer import train_all
from app.preprocessing.feature_validation import LeakageError


@pytest.fixture(scope="module")
def trained(tmp_path_factory, request):
    import numpy as np, pandas as pd
    rng = np.random.default_rng(0); n = 120
    df = pd.DataFrame({"Age": rng.integers(30, 80, n), "Sex": rng.choice(["Male", "Fmale"], n),
                       "BP": rng.integers(90, 180, n).astype(float), "HTN": rng.integers(0, 2, n),
                       "Typical Chest Pain": rng.integers(0, 2, n), "LDL": rng.normal(110, 30, n),
                       "Q Wave": rng.choice(["Y", "N"], n)})
    r = (df["Age"] - 55) / 20 + df["Typical Chest Pain"]
    df["Cath"] = np.where(r + rng.normal(0, .5, n) > .5, "Cad", "Normal")
    for k, s in (("LAD", .8), ("LCX", 1.0), ("RCA", .9)):
        df[k] = (r + rng.normal(0, s, n) > 1.0).astype(int)
    d = tmp_path_factory.mktemp("m")
    out = train_all(df, out_dir=d, folds=3, repeats=1)
    return d, out


def test_registry_has_all_models():
    assert {"logistic_regression", "random_forest", "xgboost", "ensemble", "mlp"} <= set(list_models())


def test_new_model_plugs_in_without_other_changes():
    from sklearn.ensemble import GradientBoostingClassifier

    @register
    class GB(BaseModel):
        name = "gb_test"
        def build(self, seed): return GradientBoostingClassifier(random_state=seed)
    assert get_model("gb_test").name == "gb_test"


def test_cv_covers_all_targets_models_and_metrics(trained):
    res = trained[1]["results"]
    assert set(res.target) == set(TARGETS)
    assert {"logistic_regression", "random_forest", "xgboost", BASELINE} <= set(res.model)
    assert {"accuracy_mean", "precision_mean", "recall_mean", "f1_mean", "roc_auc_mean"} <= set(res.columns)


def test_selection_never_picks_baseline(trained):
    assert BASELINE not in trained[1]["selected"].values()


def test_predict_shape_and_ranges(trained):
    out = Predictor(trained[0]).predict({"Age": 70, "Sex": "Male", "Typical Chest Pain": 1})
    for t in TARGETS:
        assert out[t]["status"] in (0, 1) and 0 <= out[t]["probability"] <= 1


def test_predictions_depend_on_input(trained):
    p = Predictor(trained[0])
    a = p.predict({"Age": 35, "Typical Chest Pain": 0})["cad"]["probability"]
    b = p.predict({"Age": 78, "Typical Chest Pain": 1})["cad"]["probability"]
    assert a != b


@pytest.mark.parametrize("bad", ["LAD", "LCX", "RCA", "Cath"])
def test_leak_columns_rejected_at_inference(trained, bad):
    with pytest.raises(LeakageError):
        Predictor(trained[0]).predict({"Age": 60, bad: 1})


def test_unknown_feature_rejected_and_range_warning(trained):
    p = Predictor(trained[0])
    with pytest.raises(ValueError):
        p.predict({"Made Up Feature": 1})
    assert p.predict({"Age": 300})["warnings"]


def test_artifacts_saved(trained):
    d = trained[0]
    assert all((d / t / "model.joblib").exists() and (d / t / "metadata.json").exists() for t in TARGETS)
    assert (d / "model_evaluation.md").exists()
