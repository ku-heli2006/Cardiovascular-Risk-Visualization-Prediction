import { pc } from "../../utils/reliability.js";

// Reliability diagram: if the model is well calibrated its points sit on the dashed diagonal
// (a predicted 70% really happens ~70% of the time). Vertical bars are 95% confidence intervals; dot size ~ patients.
export default function ReliabilityChart({ calibration }) {
  if (!calibration?.bins) return null;
  const W = 300, H = 250, L = 38, R = 10, T = 10, B = 34, w = W - L - R, h = H - T - B;
  const x = (v) => L + v * w, y = (v) => T + (1 - v) * h;
  const bins = calibration.bins.filter((b) => b.n > 0);
  const maxN = Math.max(...bins.map((b) => b.n), 1);
  return (
    <div className="reliability">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Reliability diagram: predicted risk versus observed rate">
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <line x1={L} x2={L + w} y1={y(t)} y2={y(t)} className="grid" />
            <text x={L - 6} y={y(t) + 3} textAnchor="end" className="ax">{pc(t)}</text>
            <text x={x(t)} y={T + h + 14} textAnchor="middle" className="ax">{pc(t)}</text>
          </g>))}
        <line x1={x(0)} y1={y(0)} x2={x(1)} y2={y(1)} className="diag" />
        {bins.map((b) => (
          <g key={b.lo}>
            <line x1={x(b.mean_predicted)} x2={x(b.mean_predicted)} y1={y(b.ci_low)} y2={y(b.ci_high)} className="ci" />
            <circle cx={x(b.mean_predicted)} cy={y(b.observed_rate)} r={4 + 6 * Math.sqrt(b.n / maxN)} className="pt">
              <title>{`Model said ${pc(b.lo)}–${pc(b.hi)} (mean ${pc(b.mean_predicted)}). Actually ${pc(b.observed_rate)} `
                + `of ${b.n} patients (95% CI ${pc(b.ci_low)}–${pc(b.ci_high)}).`}</title>
            </circle>
          </g>))}
        <text x={L + w / 2} y={H - 4} textAnchor="middle" className="axt">what the model said</text>
        <text x={10} y={T + h / 2} textAnchor="middle" transform={`rotate(-90 10 ${T + h / 2})`} className="axt">what actually happened</text>
      </svg>
      <div className="rel-side">
        <div className="small"><b>Brier score</b> {calibration.brier.toFixed(3)} (lower is better; always guessing the average scores
          about {(() => { const pos = bins.reduce((a, b) => a + b.positives, 0), n = bins.reduce((a, b) => a + b.n, 0); const q = pos / n; return (q * (1 - q)).toFixed(3); })()})</div>
        <div className="small"><b>Calibration error (ECE)</b> {calibration.ece.toFixed(3)} (0 = a predicted 70% always means 70%)</div>
        <table className="tbl mini">
          <thead><tr><th>Model said</th><th>Patients</th><th>Actually had it</th><th>95% CI</th></tr></thead>
          <tbody>{calibration.bins.map((b) => (
            <tr key={b.lo}><td>{pc(b.lo)}–{pc(b.hi)}</td><td>{b.n}</td>
              <td>{b.n ? pc(b.observed_rate) : "—"}</td><td>{b.n ? `${pc(b.ci_low)}–${pc(b.ci_high)}` : "—"}</td></tr>))}</tbody>
        </table>
        <div className="muted small">{calibration.note}</div>
      </div>
    </div>
  );
}
