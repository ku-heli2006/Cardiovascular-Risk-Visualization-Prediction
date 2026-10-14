"""SHAP must work for EVERY registered model type, not just whichever one got selected."""
import math
import joblib
import numpy as np
import pandas as pd
import pytest
from app.explainability.shap_explainer import Explainer
from app.models.base_model import make_pipeline
from app.models.model_registry import get_model
from app.models.predictor import Predictor
from app.preprocessing.pipeline import clean_features, feature_schema


@pytest.mark.parametrize("name", ["logistic_regression", "random_forest", "xgboost", "ensemble", "mlp"])
def test_shap_additive_for_each_model(synthetic_df, tmp_path, name):
    from app.config import TARGETS
    X = clean_features(synthetic_df)
    schema = feature_schema(X)
    y = (synthetic_df["Cath"] == "Cad").astype(int).to_numpy()
    for t in TARGETS:
        pipe = make_pipeline(get_model(name), X, 0).fit(X, y)
        d = tmp_path / t; d.mkdir()
        joblib.dump(pipe, d / "model.joblib")
        joblib.dump(pipe.named_steps["prep"].transform(X).head(50), d / "background.joblib")
        import json
        (d / "metadata.json").write_text(json.dumps({"target": t, "model": name, "threshold": .5,
                                                      "schema": schema, "cv_metrics": {}}))
    ex = Explainer(Predictor(tmp_path))
    patient = X.iloc[3].dropna().to_dict()
    r = ex.explain("cad", patient)
    prob = 1 / (1 + math.exp(-r["output_value"])) if r["unit"] == "log-odds" else r["output_value"]
    assert abs(prob - r["probability"]) < 1e-2
    assert r["contributions"] and set(r["contributions"][0]) >= {"feature", "value", "shap_value", "direction"}
