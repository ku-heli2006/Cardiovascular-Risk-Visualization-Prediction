// Turns the overall-CAD SHAP explanation into a per-structure "what drove the estimate" map.
// For each structure: net = sum of SHAP values of the dataset measurements associated with it.
// This is model attribution, NOT a lesion or damage map.
import { STRUCTURES } from "../components3d/HeartModel/structures.js";

export function computeAttribution(explanation) {
  if (!explanation) return {};
  const by = Object.fromEntries(explanation.contributions.map((c) => [c.feature, c]));
  const out = {};
  for (const s of Object.values(STRUCTURES)) {
    if (!s.findings?.length) continue;
    const items = s.findings.map((f) => by[f]).filter(Boolean);
    if (!items.length) continue;
    out[s.id] = { net: items.reduce((a, c) => a + c.shap_value, 0), n: items.length };
  }
  return out;
}

const GREY = [86, 99, 114], RED = [229, 83, 75], BLUE = [74, 143, 231];
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const hex = (rgb) => "#" + rgb.map((v) => v.toString(16).padStart(2, "0")).join("");

// colour for a net contribution; strength is relative to the strongest structure
export function attributionColor(net, maxAbs) {
  const t = Math.min(1, Math.abs(net) / (maxAbs || 1)) ** 0.7;
  return hex(mix(GREY, net >= 0 ? RED : BLUE, t));
}

export function fmtNet(net, unit) {
  const s = net >= 0 ? "+" : "−";
  return unit === "log-odds" ? `${s}${Math.abs(net).toFixed(2)}` : `${s}${Math.abs(net * 100).toFixed(1)} pts`;
}
