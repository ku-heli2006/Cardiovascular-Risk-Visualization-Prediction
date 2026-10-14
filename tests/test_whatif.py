"""/whatif: model-sensitivity curves. SYNTHETIC data; tests the plumbing and invariants only."""
import pytest
from fastapi.testclient import TestClient
from app import state
from app.main import app

P = {"Age": 66, "Sex": "Male", "BP": 150, "HTN": 1, "Typical Chest Pain": 1, "LDL": 130, "Q Wave": "N"}


@pytest.fixture
def client(trained_dir):
    state.load(trained_dir)
    return TestClient(app)


def test_numeric_curve_matches_predict_at_the_entered_value(client):
    j = client.post("/whatif", json={"features": P, "feature": "Age", "points": 9}).json()
    assert j["kind"] == "numeric" and len(j["values"]) == 9
    assert set(j["probabilities"]) == {"cad", "lad", "lcx", "rca"}
    assert all(len(v) == 9 and all(0 <= x <= 1 for x in v) for v in j["probabilities"].values())
    # the curve must reproduce /predict when the swept value equals the entered one
    pred = client.post("/predict", json={"features": {**P, "Age": j["values"][4]}}).json()
    assert abs(pred["cad"]["probability"] - j["probabilities"]["cad"][4]) < 1e-3
    assert "not causal" in j["note"] and "treatment recommendation" in j["note"]


def test_binary_and_categorical_features(client):
    b = client.post("/whatif", json={"features": P, "feature": "HTN"}).json()
    assert b["kind"] == "binary" and b["values"] == [0, 1]
    c = client.post("/whatif", json={"features": P, "feature": "Sex"}).json()
    assert c["kind"] == "categorical" and set(c["values"]) == {"Male", "Fmale"}


def test_blank_current_value_is_reported_as_none(client):
    j = client.post("/whatif", json={"features": {"Age": 50}, "feature": "BP"}).json()
    assert j["current"] is None


@pytest.mark.parametrize("bad", ["LAD", "LCX", "RCA", "Cath", "Nope"])
def test_cannot_sweep_leakage_or_unknown_columns(client, bad):
    assert client.post("/whatif", json={"features": P, "feature": bad}).status_code == 422


def test_leak_column_in_features_rejected(client):
    assert client.post("/whatif", json={"features": {**P, "LAD": 1}, "feature": "Age"}).status_code == 422


def test_points_bounds(client):
    assert client.post("/whatif", json={"features": P, "feature": "Age", "points": 2}).status_code == 422
