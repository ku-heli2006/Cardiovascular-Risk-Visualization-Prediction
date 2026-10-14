from __future__ import annotations
import json
import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException
from .. import state
from ..data.loader import build_targets, load_raw
from ..preprocessing.feature_validation import LeakageError
from ..preprocessing.pipeline import clean_features
from ..schemas.patient import PatientRequest
from ..schemas.prediction import PredictionResponse

router = APIRouter()


def _need_models():
    if not state.predictor or not state.predictor.ready:
        raise HTTPException(503, "Models not trained. Run: python -m app.models.trainer")
    return state.predictor


def _py(v):
    if v is None or (isinstance(v, float) and np.isnan(v)) or v is pd.NA:
        return None
    return v.item() if hasattr(v, "item") else v


@router.post("/predict", response_model=PredictionResponse)
def predict(req: PatientRequest):
    p = _need_models()
    try:
        out = p.predict(req.features)
    except (LeakageError, ValueError) as e:
        raise HTTPException(422, str(e))
    return {**out, "case_id": req.case_id, "source": req.source}


@router.get("/schema")
def schema():
    p = _need_models()
    return p.schema


@router.get("/evaluation")
def evaluation():
    f = state.models_dir / "cv_results.csv"
    if not f.exists():
        raise HTTPException(404, "No evaluation results yet. Train the models first.")
    df = pd.read_csv(f)
    sel = {t: m["model"] for t, m in state.predictor.meta.items()} if state.predictor else {}
    cal = {}                                              # reliability of the probabilities, if the trainer produced it
    for t in sel:
        f = state.models_dir / t / "calibration.json"
        if f.exists():
            cal[t] = json.loads(f.read_text())
    return {"selected": sel, "results": json.loads(df.to_json(orient="records")), "calibration": cal}


@router.get("/cases")
def cases():
    try:
        n = len(load_raw())
    except FileNotFoundError as e:
        raise HTTPException(404, str(e))
    return {"count": n, "de_identified": True,
            "note": "De-identified records from the Z-Alizadeh Sani dataset."}


@router.get("/cases/{index}")
def case(index: int):
    try:
        raw = load_raw()
    except FileNotFoundError as e:
        raise HTTPException(404, str(e))
    if not 1 <= index <= len(raw):
        raise HTTPException(404, f"Record must be between 1 and {len(raw)}")
    row = raw.iloc[[index - 1]]
    feats = clean_features(row).iloc[0].to_dict()
    labels = build_targets(row).iloc[0].to_dict()
    return {"case_id": f"dataset-{index}", "source": "dataset", "de_identified": True,
            "features": {k: _py(v) for k, v in feats.items() if _py(v) is not None},
            "recorded_labels": {k: _py(v) for k, v in labels.items()},
            "labels_note": "Recorded dataset labels, shown for comparison only. Never used as model input."}
