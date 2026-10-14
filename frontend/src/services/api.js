const BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

async function req(path, opts) {
  const r = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" }, ...opts,
  });
  if (!r.ok) {
    let msg = `${r.status}`;
    try { const j = await r.json(); msg = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail); } catch {}
    throw new Error(msg);
  }
  return r.json();
}
const post = (path, body) => req(path, { method: "POST", body: JSON.stringify(body) });

export const api = {
  health: () => req("/health"),
  schema: () => req("/schema"),
  evaluation: () => req("/evaluation"),
  whatif: (body) => post("/whatif", body),
  caseCount: () => req("/cases"),
  caseById: (i) => req(`/cases/${i}`),
  predict: (body) => post("/predict", body),
  explain: (body) => post("/explain", body),
};
