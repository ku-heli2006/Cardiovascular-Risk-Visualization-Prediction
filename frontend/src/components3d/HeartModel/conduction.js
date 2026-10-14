// Schematic cardiac conduction system, in the same heart coordinates as anatomy.js.
// Illustrative anatomy only: the timing windows (t0..t1, seconds within CYCLE) drive a cosmetic pulse and
// are NOT computed from any patient measurement.
import * as THREE from "three";
import { PHI_A, PHI_P, surfacePoint } from "./anatomy.js";

const V = (...a) => new THREE.Vector3(...a);
const spline = (pts) => new THREE.CatmullRomCurve3(pts, false, "centripetal");

// point inside the wall between the ventricles: t 0 = front groove, 1 = back groove
const septum = (c, t) => surfacePoint(c, PHI_A, 0).lerp(surfacePoint(c, PHI_P, 0), t);
const LV_SIDE = V(0.97, 0, -0.23);                       // direction from the septum toward the LV free wall
const lvSide = (p, d) => p.clone().addScaledVector(LV_SIDE, d);
const rvSide = (p, d) => p.clone().addScaledVector(LV_SIDE, -d);
const inner = (c, phi) => surfacePoint(c, phi, -0.13);   // just under the inner lining of the wall

export function buildConduction() {
  const sa = V(-1.04, 1.04, 0.14);
  const av = V(-0.18, 0.52, -0.08);
  const hisEnd = septum(0.22, 0.5);
  const apexL = lvSide(septum(-0.82, 0.5), 0.1);
  const apexR = rvSide(septum(-0.82, 0.5), 0.1);

  const tubes = [
    { id: "sa_node", curve: spline([sa, V(-0.8, 1.0, 0.0), V(-0.5, 0.82, -0.04), av]), r0: 0.022, r1: 0.022, t0: 0.0, t1: 0.22 },
    { id: "his", curve: spline([av, septum(0.4, 0.5), hisEnd]), r0: 0.03, r1: 0.03, t0: 0.36, t1: 0.44 },
    { id: "rbb", curve: spline([hisEnd, rvSide(septum(-0.1, 0.5), 0.1), rvSide(septum(-0.5, 0.5), 0.1), apexR]),
      r0: 0.026, r1: 0.02, t0: 0.44, t1: 0.62 },
    { id: "lbb", curve: spline([hisEnd, lvSide(septum(-0.1, 0.5), 0.1), lvSide(septum(-0.5, 0.5), 0.1), apexL]),
      r0: 0.026, r1: 0.02, t0: 0.44, t1: 0.62 },
  ];
  // Purkinje network: from each apex up the inner walls (left side has two fascicles)
  const fan = [
    [apexL, [[-0.8, 1.5], [-0.45, 1.25], [-0.05, 1.0], [0.3, 0.85]]],
    [apexL, [[-0.8, 1.9], [-0.45, 2.2], [-0.05, 2.5], [0.3, 2.75]]],
    [apexL, [[-0.8, 1.1], [-0.4, 0.8], [0.0, 0.62], [0.3, 0.55]]],
    [apexR, [[-0.8, -0.3], [-0.45, -0.55], [-0.05, -0.8], [0.3, -1.0]]],
    [apexR, [[-0.8, -0.9], [-0.45, -1.3], [-0.05, -1.7], [0.3, -2.0]]],
  ];
  for (const [start, pairs] of fan) {
    tubes.push({ id: "purkinje", curve: spline([start.clone(), ...pairs.map(([c, p]) => inner(c, p))]),
      r0: 0.016, r1: 0.008, t0: 0.62, t1: 0.8 });
  }

  const nodes = [
    { id: "sa_node", p: sa, r: 0.075, t0: 0.0, t1: 0.1 },
    { id: "av_node", p: av, r: 0.065, t0: 0.22, t1: 0.36 },
  ];
  return { tubes, nodes };
}
