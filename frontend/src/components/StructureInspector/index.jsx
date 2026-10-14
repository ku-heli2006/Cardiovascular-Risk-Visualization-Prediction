import { GROUPS, ORDER, STRUCTURES, VESSEL_IDS } from "../../components3d/HeartModel/structures.js";
import { TARGET_LABEL, pct, probabilityToColor, riskBand } from "../../utils/probabilityMapping.js";
import { fmtNet } from "../../utils/attribution.js";

// Explains whatever is selected in the 3D view: what it does, which dataset measurements relate to it,
// and (after a prediction) how much each of those pushed the overall CAD estimate up or down.
export default function StructureInspector({ structure, onSelect, prediction, unavailable, explanation, submitted, attribution }) {
  const s = STRUCTURES[structure] ?? STRUCTURES.heart;
  const isVessel = VESSEL_IDS.includes(s.id);
  const noModel = unavailable.includes(s.id);
  const pred = prediction?.[s.id];
  const by = Object.fromEntries((explanation?.contributions ?? []).map((c) => [c.feature, c]));
  const feats = submitted?.features ?? {};
  const unit = explanation?.unit;
  const attr = attribution?.[s.id];
  const row = (f, why) => {
    const c = by[f];
    const v = feats[f];
    return (
      <tr key={f + why}>
        <td>{f}</td>
        <td>{v === undefined ? <span className="muted">not entered</span> : String(v)}</td>
        <td>{c ? <span className={c.direction === "increases" ? "up" : "down"}>
          {c.direction === "increases" ? "▲" : "▼"} {fmtNet(c.shap_value, unit)}</span>
          : <span className="muted">{explanation ? "small / not in top list" : "—"}</span>}</td>
      </tr>);
  };
  const Table = ({ title, items }) => items?.length ? (
    <>
      <h4>{title}</h4>
      <table className="tbl mini"><thead><tr><th>Measurement</th><th>Value</th><th>Effect on overall CAD estimate</th></tr></thead>
        <tbody>{items.map((f) => row(f))}</tbody></table>
    </>) : null;

  return (
    <div className="inspector">
      <div className="insp-head">
        <h3>{s.name}</h3>
        <span className="tag">{GROUPS[s.group]}</span>
      </div>
      <div className="chips nav">
        {ORDER.map((id) => (
          <button key={id} className={`chip btn ${id === s.id ? "on" : ""}`} onClick={() => onSelect(id)}
                  title={STRUCTURES[id].name}>{STRUCTURES[id].name.split(":")[0].replace(/ \(.*\)/, "")}</button>))}
      </div>
      <p className="role">{s.role}</p>

      {isVessel && (
        noModel ? <div className="note-box">No vessel-level model is available for {TARGET_LABEL[s.id]}: the loaded dataset has no
          {" "}{s.id.toUpperCase()} labels. Nothing is shown about this artery's condition. Train on the Extension dataset to enable it.</div>
        : pred ? <div className="note-box" style={{ borderLeftColor: probabilityToColor(pred.probability) }}>
            <b>{TARGET_LABEL[s.id]} stenosis estimate: <span style={{ color: probabilityToColor(pred.probability) }}>{pct(pred.probability)}</span></b>
            {" "}· model output {pred.status ? "positive" : "negative"} · {riskBand(pred.probability)}
          </div> : <div className="muted small">Run a prediction to see this artery's estimate.</div>)}
      {s.id === "heart" && pred === undefined && prediction?.cad && (
        <div className="note-box" style={{ borderLeftColor: probabilityToColor(prediction.cad.probability) }}>
          <b>Overall CAD estimate: <span style={{ color: probabilityToColor(prediction.cad.probability) }}>{pct(prediction.cad.probability)}</span></b>
          {" "}· model output {prediction.cad.status ? "positive" : "negative"}
        </div>)}

      {attr && explanation && (
        <div className="small">Net effect of this region's related measurements on the overall CAD estimate:{" "}
          <b className={attr.net >= 0 ? "up" : "down"}>{fmtNet(attr.net, unit)}</b></div>)}

      <Table title={isVessel ? "Clinical findings often associated with this territory" : "Related measurements in the dataset"} items={s.findings} />
      <Table title="General risk factors (shared by all three coronary arteries)" items={s.riskFactors} />
      {!s.findings?.length && !s.riskFactors?.length && s.id !== "heart" && (
        <div className="muted small">No measurement in this dataset relates to this structure.</div>)}
      {s.note && <p className="muted small">{s.note}</p>}
      <p className="muted small caveat">Effects shown are the model's attribution for the <b>overall CAD</b> estimate, not an
        artery- or location-specific finding. The dataset records no lesion locations, nerve or rhythm data.</p>
    </div>
  );
}
