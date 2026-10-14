# Interactive 3D Cardiovascular Risk Visualization (Track A)

Predicts overall CAD and LAD / LCX / RCA stenosis from the Z-Alizadeh Sani dataset, explains each
prediction with SHAP, and colours an interactive 3D heart by the predicted probabilities.

**Decision-support / educational use only. Not a diagnostic device.**

## Run (Windows PowerShell; folder names assume you are in the project root)

```powershell
python -m pip install -r requirements.txt
python -m pytest tests -q                      # synthetic data only

# 1. put the dataset (.csv/.xlsx, "Extension of Z-Alizadeh Sani") in data\raw\
# 2. train: CV-compares 5 models (logistic, random forest, XGBoost, ensemble, neural net) on every target that has labels, saves the best per target
cd backend
python -m app.models.trainer                    # writes ..\models\ and ..\docs\model_evaluation.md

# 3. start the API (keep this window open)
uvicorn app.main:app --port 8000

# 4. in a SECOND window: start the website (needs Node.js 18+)
cd frontend
npm install
npm run dev                                     # open http://localhost:5173
```

## Architecture
`React + React Three Fiber  ->  FastAPI  ->  preprocessing / models / SHAP  ->  saved artifacts`

| Endpoint | Purpose |
|---|---|
| `POST /predict` | status + probability for CAD, LAD, LCX, RCA |
| `POST /explain` | SHAP contributions for one target |
| `GET /health` | model status + cross-validated AUC per target |
| `POST /whatif` | model sensitivity: sweep ONE measurement, all others fixed (not causal, not advice) |
| `GET /schema`, `/evaluation`, `/cases`, `/cases/{n}` | input form, validation table, de-identified dataset records |

## Guarantees enforced in code (and tested)
- `LAD`, `LCX`, `RCA`, `Cath` never reach a model: dropped in preprocessing, re-checked on the transformed
  columns, and rejected at the API (`tests/test_leakage.py`, `tests/test_api.py`).
- Preprocessing is fitted inside each CV training fold (it is part of the sklearn pipeline).
- Model per target is chosen from cross-validation results, not assumed. A majority-class baseline is reported.
- SHAP values are checked to add up to the model output for every registered model type.
- The same function maps probability -> colour for the 3D arteries and the dashboard cards.

## Extending
- **New model:** subclass `BaseModel`, decorate with `@register` (see `models/xgboost_model.py`). No API/UI change.
- **New feature:** add the column name to a group in `config.py` (or leave it uncategorised); retrain.
- **New vessel:** add an entry to `frontend/src/components3d/VesselInteraction/vessels.js` and a target in `config.py`.

## Trainer options (run from `backend`)
```powershell
python -m app.models.trainer                  # default models (logistic, random forest, xgboost, ensemble, mlp), 5-fold x 3
python -m app.models.trainer --quick          # 3-fold x 1: fast sanity run
python -m app.models.trainer --models all     # also the slow, properly nested hyper-parameter-tuned variants
python -m app.models.trainer "path\to\extention of Z-Alizadeh sani dataset.xlsx"
```
The model for each target is chosen by cross-validated ROC-AUC, never assumed. The report also lists the Brier score
(lower = better probability quality) and a reliability chart ("when the model says 80%, how often is it right?").

## 3D explorer
Hover any structure for its name and role; click to open the inspector (what it does, which dataset measurements relate
to it, and how much each pushed the overall CAD estimate). Layers: heart muscle, great vessels, coronary arteries,
cardiac veins, conduction system (+ see-through). "What drove it" tints regions by the net effect of their related
measurements. Pulses, the heartbeat and the conduction signal are illustrative and are not patient-derived.
The dataset has no lesion locations, nerve or rhythm data, so the 3D view never claims where disease is.

## Original vs Extension dataset
The trainer trains every target whose label column exists. With the **original** Z-Alizadeh Sani file (has `Cath`
but no `LAD`/`LCX`/`RCA`) only overall CAD is trained: the API returns `null` for the vessels plus an
`unavailable_targets` list, the UI shows "n/a", and the arteries stay grey. Vessel labels are never guessed.
Use the **Extension** file and re-run the trainer to enable LAD/LCX/RCA (stale models are cleaned up automatically).
The Extension file is UCI dataset 411, titled "extention of Z-Alizadeh sani dataset" (UCI's spelling), 303 patients, file
`extention of Z-Alizadeh sani dataset.xlsx`: https://archive.ics.uci.edu/dataset/411/extention+of+z+alizadeh+sani+dataset
Put the extracted `.xlsx` in `data\raw\` (the newest file there is used). `LAD`, `LCX`, `RCA`, `Cath` and `CAD` are
labels only and never reach a model.

## Known limitations (read before the demo)
- **The 3D heart is a procedural, stylised anatomical model** (ventricles with grooves, atria, great vessels,
  branching coronary trees), not a BodyParts3D/Sketchfab mesh. Artery paths are schematic and radii exaggerated.
  See `docs/3d_pipeline.md` to swap in a real `.glb`.
- Results come from one 303-patient dataset; no external validation. Probabilities are not recalibrated: the
  reliability chart and Brier score show how well they match observed rates, and with this little data the
  high/low bins hold few patients.
- The "related measurements" lists in `structures.json` are general clinical associations, not anatomical coordinates
  (the dataset has no lesion, nerve or rhythm data). Have a clinician review them before presenting them as domain content.
- Column groupings in `config.py` were checked against the 54 feature names of the original file (all categorised);
  after loading the Extension file, check the "Other features" group in the UI for anything uncategorised.
- Tests use synthetic data to check the code. Only the trainer's output on the real dataset is a result.
