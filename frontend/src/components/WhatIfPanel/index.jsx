import { useEffect, useMemo, useState } from "react";
import { api } from "../../services/api.js";
import { TARGET_LABEL, pct, probabilityToColor } from "../../utils/probabilityMapping.js";

const GROUP_LABEL = { demographic: "Demographics", clinical: "Clinical examination", laboratory: "Laboratory",
  ecg: "ECG", echocardiography: "Echocardiography", uncategorized: "Other" };
const W = 520, H = 210, L = 42, R = 14, T = 12, B = 34, w = W - L - R, h = H - T - B;
const y = (p) => T + (1 - p) * h;

// Sweeps ONE measurement across its training range (all others kept as entered) and plots how the model's
// estimate moves. This describes the model, not the patient: no causal or treatment meaning.
export default function WhatIfPanel({ schema, submitted, target, unavailable = [] }) {
  const t = unavailable.includes(target) ? "cad" : target;
  const [feature, setFeature] = useState("Age");
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const features = submitted?.features;

  const groups = useMemo(() => schema ? Object.entries(schema.groups).filter(([, c]) => c.length) : [], [schema]);
  useEffect(() => {
    const all = groups.flatMap(([, c]) => c);
    if (all.length && !all.includes(feature)) setFeature(all[0]);
  }, [groups]); // eslint-disable-line

  useEffect(() => {
    if (!features) { setData(null); return; }
    let live = true;
    setErr(null);
    api.whatif({ features, feature, points: 21 })
      .then((d) => live && setData(d)).catch((e) => live && setErr(e.message));
    return () => { live = false; };
  }, [features, feature]);

  if (!features) return <div className="muted">Run a prediction first, then explore how the model's estimate reacts to a single measurement.</div>;

  const probs = data?.probabilities?.[t];
  const curve = data && probs ? data.values.map((v, i) => ({ v, p: probs[i] })) : [];
  const numeric = data?.kind === "numeric";
  const lo = numeric ? data.values[0] : 0, hi = numeric ? data.values[data.values.length - 1] : 1;
  const x = (v) => numeric ? L + ((v - lo) / ((hi - lo) || 1)) * w : 0;
  const at = (v) => {                                               // curve value at the entered value (linear interpolation)
    if (!curve.length || v == null) return null;
    if (!numeric) return curve.find((c) => String(c.v) === String(v))?.p ?? null;
    const n = Number(v);
    for (let i = 1; i < curve.length; i++) if (n <= curve[i].v)
      return curve[i - 1].p + ((n - curve[i - 1].v) / ((curve[i].v - curve[i - 1].v) || 1)) * (curve[i].p - curve[i - 1].p);
    return curve[curve.length - 1].p;
  };
  const cur = data?.current;
  const pMin = curve.length ? Math.min(...curve.map((c) => c.p)) : null;
  const pMax = curve.length ? Math.max(...curve.map((c) => c.p)) : null;
  const thr = data?.thresholds?.[t] ?? 0.5;
  const bw = curve.length ? w / curve.length : 0;

  return (
    <div className="whatif">
      <div className="row wf-controls">
        <label>Measurement
          <select value={feature} onChange={(e) => setFeature(e.target.value)}>
            {groups.map(([g, cols]) => (
              <optgroup key={g} label={GROUP_LABEL[g]}>{cols.map((c) => <option key={c} value={c}>{c}</option>)}</optgroup>))}
          </select></label>
        <span className="muted small">Showing the {TARGET_LABEL[t]} estimate{t !== target ? " (selected vessel has no model)" : ""}.</span>
      </div>
      {err && <div className="error">{err}</div>}
      {curve.length > 0 && (
        <>
          <svg viewBox={`0 0 ${W} ${H}`} className="wf-svg" role="img"
               aria-label={`How the ${TARGET_LABEL[t]} estimate changes with ${feature}`}>
            {[0, 0.25, 0.5, 0.75, 1].map((g) => (
              <g key={g}><line x1={L} x2={L + w} y1={y(g)} y2={y(g)} className="grid" />
                <text x={L - 6} y={y(g) + 3} textAnchor="end" className="ax">{pct(g)}</text></g>))}
            <line x1={L} x2={L + w} y1={y(thr)} y2={y(thr)} className="thr" />
            <text x={L + w} y={y(thr) - 4} textAnchor="end" className="ax">model output turns positive at {pct(thr)}</text>
            {numeric ? (
              <>
                <polyline className="wf-line" points={curve.map((c) => `${x(c.v)},${y(c.p)}`).join(" ")} />
                {curve.map((c) => (
                  <circle key={c.v} cx={x(c.v)} cy={y(c.p)} r={3.5} fill={probabilityToColor(c.p)}>
                    <title>{`${feature} = ${c.v}: ${pct(c.p)}`}</title></circle>))}
                {cur != null && Number(cur) >= lo && Number(cur) <= hi && (
                  <g><line x1={x(Number(cur))} x2={x(Number(cur))} y1={T} y2={T + h} className="cur" />
                    <text x={x(Number(cur))} y={T + h + 24} textAnchor="middle" className="axt">entered: {String(cur)}</text></g>)}
                <text x={L} y={T + h + 14} className="ax">{lo}</text>
                <text x={L + w} y={T + h + 14} textAnchor="end" className="ax">{hi}</text>
              </>
            ) : curve.map((c, i) => (
              <g key={String(c.v)}>
                <rect x={L + i * bw + bw * 0.2} width={bw * 0.6} y={y(c.p)} height={T + h - y(c.p)}
                      fill={probabilityToColor(c.p)} opacity={String(c.v) === String(cur) ? 1 : 0.6}>
                  <title>{`${feature} = ${c.v}: ${pct(c.p)}`}</title></rect>
                <text x={L + i * bw + bw / 2} y={T + h + 14} textAnchor="middle" className="ax">{String(c.v)}</text>
                {String(c.v) === String(cur) && <text x={L + i * bw + bw / 2} y={T + h + 26} textAnchor="middle" className="axt">entered</text>}
              </g>))}
          </svg>
          <div className="small">
            Across its range in the dataset, the {TARGET_LABEL[t]} estimate moves between <b>{pct(pMin)}</b> and <b>{pct(pMax)}</b>
            {cur != null && at(cur) != null && <> (about <b>{pct(at(cur))}</b> at the entered value)</>}.
            {cur == null && <> This measurement was left blank, so the model filled it with a typical value.</>}
          </div>
        </>
      )}
      <div className="muted small caveat">{data?.note ?? "Model sensitivity only: it is not causal, not advice and not a treatment recommendation."}
        {" "}Values outside the range seen in the 303 training patients are not explored.</div>
    </div>
  );
}
