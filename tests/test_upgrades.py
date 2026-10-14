"""Model upgrades: calibration evidence, Brier score, tuned models, robust loading of the Extension file.
All data here is SYNTHETIC (only column names mimic the real files); it tests code paths, not accuracy."""
import json
import os
import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient
from app import state
from app.data.loader import build_targets, find_raw_file, load_raw
from app.evaluation.calibration import calibration_summary, reliability_table, wilson
from app.evaluation.metrics import METRICS, compute_metrics
from app.main import app
from app.models.model_registry import default_models, get_model, list_models
from app.models.trainer import _pick_models, train_all
from app.preprocessing.feature_validation import LeakageError, assert_no_leakage
from app.preprocessing.pipeline import clean_features


# ------------------------------------------------------------------ calibration / Brier
def test_wilson_interval_contains_rate_and_is_ordered():
    lo, hi = wilson(9, 10)
    assert 0 <= lo < 0.9 < hi <= 1
    assert wilson(0, 0)[0] != wilson(0, 0)[0]            # nan for empty bin


def test_reliability_bins_partition_all_patients():
    rng = np.random.default_rng(0)
    p = rng.random(500)
    y = (rng.random(500) < p).astype(int)               # perfectly calibrated by construction
    rows = reliability_table(y, p)
    assert sum(r["n"] for r in rows) == 500
    s = calibration_summary(y, p, "m")
    assert s["ece"] < 0.08 and 0 < s["brier"] < 0.25
    for r in rows:
        assert abs(r["mean_predicted"] - r["observed_rate"]) < 0.15


def test_reliability_includes_probability_one():
    rows = reliability_table([1, 0, 1], [1.0, 0.0, 0.99])
    assert sum(r["n"] for r in rows) == 3


def test_brier_is_reported_and_correct():
    assert "brier" in METRICS
    assert compute_metrics([0, 1, 1, 0], [0, 1, 1, 0])["brier"] == 0
    assert compute_metrics([0, 1], [1, 0])["brier"] == 1


# ------------------------------------------------------------------ tuned models
def test_tuned_models_are_opt_in_but_registered():
    assert {"xgboost_tuned", "random_forest_tuned"} <= set(list_models())
    assert not {"xgboost_tuned", "random_forest_tuned"} & set(default_models())


@pytest.mark.parametrize("name", ["xgboost_tuned", "random_forest_tuned"])
def test_tuned_model_trains_and_explains(synthetic_df, tmp_path, name):
    from app.preprocessing.pipeline import feature_schema
    from app.models.base_model import make_pipeline
    from app.models.predictor import Predictor
    from app.explainability.shap_explainer import Explainer
    import joblib
    X = clean_features(synthetic_df)
    y = (synthetic_df["Cath"] == "Cad").astype(int).to_numpy()
    pipe = make_pipeline(get_model(name), X, 0).fit(X, y)
    assert pipe.named_steps["clf"].best_params_
    d = tmp_path / "cad"; d.mkdir()
    joblib.dump(pipe, d / "model.joblib")
    joblib.dump(pipe.named_steps["prep"].transform(X).head(50), d / "background.joblib")
    (d / "metadata.json").write_text(json.dumps({"target": "cad", "model": name, "threshold": .5,
                                                  "schema": feature_schema(X), "cv_metrics": {}}))
    r = Explainer(Predictor(tmp_path)).explain("cad", X.iloc[3].dropna().to_dict())
    assert r["contributions"] and abs(r["probability"] - float(pipe.predict_proba(X.iloc[[3]])[0, 1])) < 1e-4


# ------------------------------------------------------------------ trainer + API evidence
@pytest.fixture(scope="module")
def trained(tmp_path_factory, synthetic_df=None):
    from test_partial_targets import real_shaped
    d = tmp_path_factory.mktemp("upg")
    seen = []
    out = train_all(real_shaped(150), out_dir=d, folds=3, repeats=1, models=["logistic_regression", "random_forest"],
                    progress=lambda t, n, r: seen.append((t, n)))
    return d, out, seen


def test_progress_callback_called_for_every_model_and_baseline(trained):
    assert ("cad", "logistic_regression") in trained[2] and ("cad", "majority_baseline") in trained[2]


def test_calibration_file_written_and_consistent(trained):
    d = trained[0]
    c = json.loads((d / "cad" / "calibration.json").read_text())
    assert c["n_patients"] == 150 and sum(b["n"] for b in c["bins"]) == 150
    assert c["model"] == trained[1]["selected"]["cad"]
    assert "not a guarantee" in c["note"]


def test_results_have_brier_and_oof_arrays(trained):
    res = trained[1]["results"]
    assert {"brier_mean", "brier_std"} <= set(res.columns)
    oof = res.attrs["oof"][("cad", "logistic_regression")]
    assert len(oof) == 150 and ((oof >= 0) & (oof <= 1)).all()


def test_markdown_report_has_brier_column(trained):
    md = (trained[0] / "model_evaluation.md").read_text()
    assert "brier" in md and "Brier score: lower is better" in md


def test_api_evaluation_returns_calibration(trained):
    state.load(trained[0])
    j = TestClient(app).get("/evaluation").json()
    assert "cad" in j["calibration"] and j["calibration"]["cad"]["bins"]


def test_pick_models_cli_helper():
    assert _pick_models("default") is None
    assert set(_pick_models("all")) == set(list_models())
    assert _pick_models("xgboost, mlp") == ["xgboost", "mlp"]
    with pytest.raises(SystemExit):
        _pick_models("nope")


# ------------------------------------------------------------------ Extension-file robustness
def _with_label_names(df, cad_name):
    d = df.rename(columns={"Cath": cad_name})
    return d


def test_overall_label_named_CAD_is_used_and_never_reaches_features(synthetic_df):
    df = _with_label_names(synthetic_df, "CAD")
    y = build_targets(df)
    assert set(y.columns) == {"cad", "lad", "lcx", "rca"}
    assert y.attrs["label_columns"]["cad"] == "CAD"
    X = clean_features(df)
    assert "CAD" not in X.columns
    with pytest.raises(LeakageError):
        assert_no_leakage(["Age", "CAD"])


def test_both_Cath_and_CAD_present_flags_disagreement(synthetic_df):
    df = synthetic_df.copy()
    df["CAD"] = df["Cath"]
    df.loc[df.index[:5], "CAD"] = np.where(df.loc[df.index[:5], "Cath"] == "Cad", "Normal", "Cad")
    y = build_targets(df)
    assert y.attrs["label_columns"]["cad"] == "Cath"
    assert y.attrs["label_columns"]["cad_disagrees_with_CAD"] == 5
    assert "CAD" not in clean_features(df).columns and "Cath" not in clean_features(df).columns


def test_newest_file_in_raw_is_used_and_excel_largest_sheet(synthetic_df, tmp_path, monkeypatch):
    from app.data import loader
    monkeypatch.setattr(loader, "RAW_DIR", tmp_path)
    old = tmp_path / "Z-Alizadeh old.csv"
    synthetic_df.drop(columns=["LAD", "LCX", "RCA"]).to_csv(old, index=False)
    new = tmp_path / "extention of Z-Alizadeh sani dataset.xlsx"
    with pd.ExcelWriter(new) as w:
        pd.DataFrame({"note": ["readme"]}).to_excel(w, sheet_name="About", index=False)
        synthetic_df.to_excel(w, sheet_name="Data", index=False)
    os.utime(old, (1_000_000, 1_000_000))                # make the CSV clearly older
    assert find_raw_file() == new
    df = load_raw()
    assert df.shape[0] == len(synthetic_df) and {"LAD", "LCX", "RCA"} <= set(df.columns)
    assert df.attrs["source_file"].endswith(".xlsx")


def test_excel_lock_files_are_ignored(synthetic_df, tmp_path, monkeypatch):
    from app.data import loader
    monkeypatch.setattr(loader, "RAW_DIR", tmp_path)
    real = tmp_path / "data.csv"; synthetic_df.to_csv(real, index=False)
    (tmp_path / "~$data.xlsx").write_bytes(b"lock")
    assert find_raw_file() == real
