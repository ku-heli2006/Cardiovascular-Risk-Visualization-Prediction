// Helpers for calibration.json (written by the trainer): how often patients that the model scored in a range
// really had the finding, measured on cross-validation predictions (each patient scored by models that never saw them).
export const pc = (v) => (v == null ? "—" : `${Math.round(v * 100)}%`);

export function binFor(cal, p) {
  if (!cal?.bins || p == null) return null;
  const last = cal.bins.length - 1;
  const b = cal.bins.find((x, i) => p >= x.lo && (p < x.hi || (i === last && p <= x.hi)));
  return b && b.n > 0 ? b : null;
}

// "In cross-validation, 140 patients scored 80–100% actually had CAD 93% of the time (95% CI 87–96%)."
export function realityText(cal, p, what) {
  const b = binFor(cal, p);
  if (!b) return null;
  const few = b.n < 20 ? " Few patients in this range, so treat it with caution." : "";
  return `In cross-validation, ${b.n} patients scored ${pc(b.lo)}–${pc(b.hi)} actually had ${what} ${pc(b.observed_rate)} of the time `
    + `(95% CI ${pc(b.ci_low)}–${pc(b.ci_high)}).${few}`;
}
