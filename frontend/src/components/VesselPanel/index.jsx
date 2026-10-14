import { TARGET_LABEL, VESSEL_DESC, pct, probabilityToColor, riskBand } from "../../utils/probabilityMapping.js";
import { realityText } from "../../utils/reliability.js";

export default function VesselPanel({ target, prediction, explanation, health, unavailable = [], calibration }) {
  const pred = prediction?.[target];
  const meta = health?.targets?.[target];
  const p = pred?.probability ?? null;
  if (unavailable.includes(target)) return (
    <div className="vessel-panel">
      <h3>{TARGET_LABEL[target]}</h3>
      <p className="muted small">{VESSEL_DESC[target]}</p>
      <div className="muted">No model was trained for this vessel because its labels are not in the loaded dataset.
        Load the Extension of Z-Alizadeh Sani dataset and retrain.</div>
    </div>
  );
  const what = target === "cad" ? "CAD" : `${TARGET_LABEL[target]} stenosis`;
  const reality = realityText(calibration, p, what);
  return (
    <div className="vessel-panel" style={{ borderTopColor: probabilityToColor(p) }}>
      <h3>{TARGET_LABEL[target]}</h3>
      <p className="muted small">{VESSEL_DESC[target]}</p>
      {pred ? (
        <>
          <div className="big-num" style={{ color: probabilityToColor(p) }}>{pct(p)}</div>
          <div>Model output: <b>{pred.status ? "Positive" : "Negative"}</b> · {riskBand(p)}</div>
          <div className="muted small">Model: {pred.model}
            {meta?.cv_roc_auc != null && <> · cross-validated ROC-AUC {meta.cv_roc_auc.toFixed(2)} ± {meta.cv_roc_auc_std?.toFixed(2)}</>}</div>
          {reality && <div className="reality small">{reality}</div>}
          <h4>Top contributors</h4>
          {explanation ? (
            <ul className="contrib">{explanation.contributions.slice(0, 5).map((c) => (
              <li key={c.feature}><span className={c.direction === "increases" ? "up" : "down"}>
                {c.direction === "increases" ? "▲" : "▼"}</span> {c.feature}
                {c.value !== null && <span className="muted"> = {String(c.value)}</span>}</li>))}</ul>
          ) : <div className="muted small">Loading…</div>}
        </>
      ) : <div className="muted">No prediction yet.</div>}
    </div>
  );
}
