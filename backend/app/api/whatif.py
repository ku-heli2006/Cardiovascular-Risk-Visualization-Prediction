"""POST /whatif - model sensitivity: how the estimates change if ONE measurement takes other values while
everything else stays as entered. This is a property of the trained model, NOT a causal or clinical statement."""
from __future__ import annotations
from typing import Any, Optional
import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from .. import state
from ..preprocessing.feature_validation import LeakageError

router = APIRouter()

NOTE = ("Model sensitivity only: how this model's estimate moves when one measurement is changed and all others are "
        "kept as entered. It is not causal, not advice and not a treatment recommendation.")


class WhatIfRequest(BaseModel):
    features: dict[str, Any] = Field(default_factory=dict)
    feature: str
    points: int = Field(15, ge=3, le=40)


class WhatIfResponse(BaseModel):
    feature: str
    kind: str                                    # "numeric" | "binary" | "categorical"
    values: list[Any]
    current: Optional[Any] = None                # value the user entered (None = left blank -> imputed)
    probabilities: dict[str, list[float]]        # per available target, aligned with `values`
    thresholds: dict[str, float]
    training_range: Optional[list[float]] = None
    note: str = NOTE


@router.post("/whatif", response_model=WhatIfResponse)
def whatif(req: WhatIfRequest):
    p = state.predictor
    if not p or not p.ready:
        raise HTTPException(503, "Models not trained. Run: python -m app.models.trainer")
    schema = p.schema
    if req.feature not in schema["columns"]:
        raise HTTPException(422, f"Unknown feature '{req.feature}'")
    try:
        base, _ = p.to_frame(req.features)
    except (LeakageError, ValueError) as e:
        raise HTTPException(422, str(e))

    rng = schema["numeric"].get(req.feature)
    if rng is not None:
        if rng["min"] == 0 and rng["max"] == 1:
            kind, values = "binary", [0, 1]
        else:
            kind = "numeric"
            values = [round(float(v), 4) for v in np.linspace(rng["min"], rng["max"], req.points)]
        training_range = [rng["min"], rng["max"]]
    else:
        kind, values, training_range = "categorical", list(schema["categorical"][req.feature]), None

    frame = pd.concat([base] * len(values), ignore_index=True)
    frame[req.feature] = values
    probs = {t: [round(float(x), 4) for x in p.pipes[t].predict_proba(frame)[:, 1]] for t in p.available}
    cur = req.features.get(req.feature)
    return {"feature": req.feature, "kind": kind, "values": values,
            "current": None if cur in (None, "") else cur, "probabilities": probs,
            "thresholds": {t: p.meta[t]["threshold"] for t in p.available}, "training_range": training_range}
