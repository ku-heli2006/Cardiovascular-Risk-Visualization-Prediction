"""Train: CV-compare models -> pick per target -> refit on all data -> save artifacts.

Run (from the backend folder):
    python -m app.models.trainer                       # newest file in data/raw, default models, 5-fold x 3
    python -m app.models.trainer --quick               # 3-fold x 1: fast sanity run (noisier numbers)
    python -m app.models.trainer --models all          # also the slow hyper-parameter-tuned variants
    python -m app.models.trainer --models logistic_regression,xgboost
    python -m app.models.trainer path/to/file.xlsx
"""
from __future__ import annotations
import argparse
import json
import time
import warnings
from datetime import datetime, timezone
from pathlib import Path
import joblib
import pandas as pd
from ..config import MODELS_DIR, RANDOM_SEED, ROOT, TARGETS
from ..data.loader import build_targets, load_raw
from ..data.validation import validate_dataset
from ..evaluation.calibration import calibration_summary
from ..evaluation.cross_validation import evaluate_models
from ..evaluation.reports import select_best, to_markdown
from ..preprocessing.feature_validation import assert_no_leakage, categorize_features
from ..preprocessing.pipeline import clean_features, feature_schema
from .base_model import make_pipeline
from .model_registry import default_models, get_model, list_models


def train_all(raw: pd.DataFrame, out_dir: Path = MODELS_DIR, folds: int | None = None,
              repeats: int | None = None, docs_dir: Path | None = None, models: list[str] | None = None,
              progress=None) -> dict:
    y = build_targets(raw)
    X = clean_features(raw)
    assert_no_leakage(X.columns)                           # final programmatic check
    data_report = validate_dataset(X, y)
    kw = {k: v for k, v in dict(folds=folds, repeats=repeats, models=models, progress=progress).items() if v}
    results = evaluate_models(X, y, **kw)
    selected = select_best(results)
    oof = results.attrs.get("oof", {})
    schema = feature_schema(X)
    schema["groups"] = categorize_features(X.columns)

    for t in TARGETS:
        if t not in y.columns:                     # remove stale artefacts from an earlier, fuller run
            for f in ("model.joblib", "metadata.json", "background.joblib", "calibration.json"):
                (Path(out_dir) / t / f).unlink(missing_ok=True)
            continue
        yt = y[t].astype(int).to_numpy()
        model = get_model(selected[t])
        pipe = make_pipeline(model, X, RANDOM_SEED).fit(X, yt)
        names = list(pipe.named_steps["prep"].get_feature_names_out())
        assert_no_leakage(names)
        d = Path(out_dir) / t
        d.mkdir(parents=True, exist_ok=True)
        joblib.dump(pipe, d / "model.joblib")
        Xt = pipe.named_steps["prep"].transform(X)             # background sample for SHAP
        joblib.dump(Xt.sample(min(100, len(Xt)), random_state=RANDOM_SEED), d / "background.joblib")
        row = results[(results.target == t) & (results.model == selected[t])].iloc[0].to_dict()
        (d / "metadata.json").write_text(json.dumps({
            "target": t, "model": selected[t], "threshold": 0.5, "seed": RANDOM_SEED,
            "trained_at": datetime.now(timezone.utc).isoformat(), "cv_metrics": row,
            "best_params": getattr(pipe.named_steps["clf"], "best_params_", None),
            "transformed_features": names, "schema": schema}, indent=2, default=float))
        if (t, selected[t]) in oof:                            # reliability of the probabilities (validation evidence)
            (d / "calibration.json").write_text(json.dumps(
                calibration_summary(yt, oof[(t, selected[t])], selected[t]), indent=2, default=float))
    results.to_csv(Path(out_dir) / "cv_results.csv", index=False)
    md = to_markdown(results, selected)
    (Path(out_dir) / "model_evaluation.md").write_text(md)
    if docs_dir:
        Path(docs_dir).mkdir(parents=True, exist_ok=True)
        (Path(docs_dir) / "model_evaluation.md").write_text(md)
    (Path(out_dir) / "data_report.json").write_text(json.dumps(data_report, indent=2, default=float))
    return {"selected": selected, "results": results, "data_report": data_report}


def _pick_models(arg: str) -> list[str] | None:
    if arg == "default":
        return None
    names = list_models() if arg == "all" else [m.strip() for m in arg.split(",") if m.strip()]
    unknown = [m for m in names if m not in list_models()]
    if unknown:
        raise SystemExit(f"Unknown model(s) {unknown}. Available: {list_models()}")
    return names


def main(argv=None) -> None:
    ap = argparse.ArgumentParser(prog="python -m app.models.trainer", description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("dataset", nargs="?", help="path to a .csv/.xlsx (default: newest file in data/raw)")
    ap.add_argument("--models", default="default", help="'default', 'all', or a comma list of model names")
    ap.add_argument("--folds", type=int, help="CV folds (default from config)")
    ap.add_argument("--repeats", type=int, help="CV repeats (default from config)")
    ap.add_argument("--quick", action="store_true", help="3 folds x 1 repeat")
    a = ap.parse_args(argv)
    if a.quick:
        a.folds, a.repeats = a.folds or 3, a.repeats or 1
    warnings.filterwarnings("ignore")                      # sklearn convergence / unseen-category chatter

    raw = load_raw(a.dataset)
    print(f"Dataset: {raw.attrs.get('source_file', a.dataset)}  ({raw.shape[0]} rows x {raw.shape[1]} columns)")
    chosen = _pick_models(a.models) or default_models()
    print(f"Models: {', '.join(chosen)}\nValidation: stratified {a.folds or 'default'}-fold x {a.repeats or 'default'} repeats\n")
    t0 = time.time()

    def progress(t, name, row):
        print(f"  [{time.time() - t0:6.0f}s] {t.upper():3s} {name:22s} AUC {row['roc_auc_mean']:.3f} ± {row['roc_auc_std']:.3f}"
              f"   Brier {row['brier_mean']:.3f}", flush=True)

    out = train_all(raw, docs_dir=ROOT / "docs", folds=a.folds, repeats=a.repeats, models=_pick_models(a.models),
                    progress=progress)
    print("\n" + to_markdown(out["results"], out["selected"]))
    dr = out["data_report"]
    print("\nLabel columns used:", dr.get("label_columns"))
    miss = dr.get("missing_targets", [])
    if miss:
        print(f"NOTE: no labels for {', '.join(m.upper() for m in miss)} in this file "
              "(needs the Extention of Z-Alizadeh Sani dataset, UCI id 411). Those targets were NOT trained.")
    print(f"\nDone in {time.time() - t0:.0f}s. Models saved to {MODELS_DIR}. Restart the API to load them.")


if __name__ == "__main__":
    main()
