// Catalog of every inspectable structure. Text and dataset links live in structures.json
// (tests/test_structures.py checks that every listed measurement is a real dataset column).
import data from "./structures.json";

export const STRUCTURES = Object.fromEntries(data.map((s) => [s.id, s]));
export const ORDER = data.map((s) => s.id);
export const VESSEL_IDS = ["lad", "lcx", "rca"];
export const GROUPS = {
  overview: "Overview", chamber: "Heart chambers", vessel: "Great vessels",
  coronary: "Coronary arteries", vein: "Cardiac veins", conduction: "Electrical conduction",
};

// scene mesh name (from buildStatic) -> structure id
const PART = {
  right_atrium: "ra", right_auricle: "ra", left_atrium: "la", left_auricle: "la",
  aorta: "aorta", pulmonary_trunk: "pulm", left_pa: "pulm", right_pa: "pulm",
  svc: "svc", pv_left_upper: "pv", pv_left_lower: "pv",
};
export const structureOfPart = (name) => (name.startsWith("arch_branch") ? "aorta" : PART[name] ?? null);
export const firstSentence = (t) => t.split(/(?<=\.)\s/)[0];
