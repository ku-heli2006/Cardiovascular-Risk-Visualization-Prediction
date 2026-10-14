import { useEffect, useState } from "react";
import ReliabilityChart from "../ReliabilityChart/index.jsx";

const BASE = ["accuracy", "precision", "recall", "f1", "roc_auc"];
const fmt = (r, m) => (r[`${m}_mean`] == null ? "—" : `${r[`${m}_mean`].toFixed(3)} ± ${(r[`${m}_std`] ?? 0).toFixed(3)}`);

export default function ModelEvaluation({ evaluation }) {
  const [t, setT] = useState("cad");
  const targets = evaluation ? Object.keys(evaluation.selected) : [];
  useEffect(() => { if (targets.length && !targets.includes(t)) setT(targets[0]); }, [targets.join(), t]); // eslint-disable-line
  if (!evaluation) return <div className="muted">Evaluation results are not available yet. Train the models first.</div>;
  const rows = evaluation.results.filter((r) => r.target === t);
  const hasBrier = rows.some((r) => r.brier_mean != null);          // older training runs have no Brier column
  const M = hasBrier ? [...BASE, "brier"] : BASE;
  const cal = evaluation.calibration?.[t];
  return (
    <div>
      <div className="tabs">{targets.map((x) => (
        <button key={x} className={x === t ? "on" : ""} onClick={() => setT(x)}>{x.toUpperCase()}</button>))}</div>
      <div className="scroll-x">
        <table className="tbl">
          <thead><tr><th>Model</th>{M.map((m) => <th key={m}>{m === "brier" ? "brier (lower = better)" : m.replace("_", "-")}</th>)}</tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.model} className={evaluation.selected[t] === r.model ? "best" : ""}>
              <td>{r.model}{evaluation.selected[t] === r.model && <span className="tag">selected</span>}</td>
              {M.map((m) => <td key={m}>{fmt(r, m)}</td>)}</tr>))}</tbody>
        </table>
      </div>
      <div className="muted small">Repeated stratified cross-validation, mean ± std over {rows[0]?.n_folds} folds. These are
        validation estimates on a single 303-patient dataset and may not generalise to other populations.
        Models whose AUC is within noise of each other are effectively tied; the majority baseline shows what always
        predicting the most common class would score.</div>
      {cal && (<>
        <h4>Do the percentages mean what they say? ({t.toUpperCase()}, {cal.model})</h4>
        <ReliabilityChart calibration={cal} />
      </>)}
    </div>
  );
}
