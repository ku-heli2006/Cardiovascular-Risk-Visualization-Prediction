// Procedural heart anatomy (no external mesh). Everything is plain three.js geometry.
// Coordinates: +y up (base -> apex is -y), +z toward the viewer (anterior), +x = patient's LEFT.
import * as THREE from "three";

const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const gauss = (x, w) => Math.exp(-(x * x) / (w * w));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const noise = (x, y, z) =>
  Math.sin(x * 5.1 + y * 3.7 + 1.3) * Math.sin(y * 4.3 + z * 5.9 + 2.1) * Math.sin(z * 3.1 + x * 4.7 + 0.7);

export const PHI_A = 0.5;      // anterior interventricular groove (azimuth)
export const PHI_P = -2.65;    // posterior interventricular groove
export const C_AV = 0.45;      // atrioventricular groove height (cos theta)

// ---- ventricular mass: theta 0 = top pole, PI = apex; phi 0 = front, + toward patient's left ----
export function bodyPoint(theta, phi) {
  const s = Math.sin(theta), c = Math.cos(theta);
  const lower = Math.max(0, -c);
  const taper = 1 - 0.6 * Math.pow(lower, 1.15);                 // egg -> cone toward the apex
  const lowMask = smooth(0.5, -0.05, c);
  let r = 1 + 0.11 * Math.cos(phi - 1.8) - 0.05 * Math.cos(phi + 0.5);   // LV bulge, flatter RV
  r -= 0.08 * gauss(wrap(phi - PHI_A), 0.16) * lowMask;          // anterior groove
  r -= 0.065 * gauss(wrap(phi - PHI_P), 0.16) * lowMask;         // posterior groove
  r -= 0.07 * gauss(c - C_AV, 0.09);                             // coronary (AV) sulcus
  const x0 = s * Math.sin(phi), z0 = s * Math.cos(phi), y0 = c > 0 ? c : c * 1.5;
  r *= 1 + 0.014 * noise(x0 * 2, y0 * 2, z0 * 2);
  return new THREE.Vector3(0.98 * r * taper * x0, y0, 0.82 * r * taper * z0);
}

function bodyNormal(theta, phi) {
  const e = 1e-3;
  const t1 = bodyPoint(theta + e, phi).sub(bodyPoint(theta - e, phi));
  const t2 = bodyPoint(theta, phi + e).sub(bodyPoint(theta, phi - e));
  const n = new THREE.Vector3().crossVectors(t1, t2).normalize();
  const p = bodyPoint(theta, phi);
  if (n.dot(new THREE.Vector3(p.x, 0, p.z)) < 0) n.negate();
  return n;
}

// point on / just above the ventricular surface, addressed by (cos theta, phi)
export function surfacePoint(c, phi, offset = 0) {
  const theta = Math.acos(clamp(c, -0.985, 0.985));
  const p = bodyPoint(theta, phi);
  return p.add(bodyNormal(theta, phi).multiplyScalar(offset));
}

const MUSCLE = new THREE.Color("#b23a41"), MUSCLE2 = new THREE.Color("#cc5a5f"), FAT = new THREE.Color("#e3b86a");

export function buildBody(nT = 80, nP = 120) {
  const pos = [], col = [], idx = [];
  for (let i = 0; i <= nT; i++) {
    const theta = (i / nT) * Math.PI;
    for (let j = 0; j <= nP; j++) {
      const phi = (j / nP) * Math.PI * 2 - Math.PI;
      const p = bodyPoint(theta, phi);
      pos.push(p.x, p.y, p.z);
      const c = Math.cos(theta), lowMask = smooth(0.5, -0.05, c);
      const fat = clamp(Math.max(gauss(wrap(phi - PHI_A), 0.2) * lowMask, gauss(wrap(phi - PHI_P), 0.2) * lowMask,
                        gauss(c - C_AV, 0.12)) * 0.9 + 0.1 * noise(p.x * 4, p.y * 4, p.z * 4), 0, 1);
      const base = MUSCLE.clone().lerp(MUSCLE2, 0.5 + 0.5 * Math.cos(phi - 0.2));
      const k = base.lerp(FAT, fat * 0.7);
      col.push(k.r, k.g, k.b);
    }
  }
  for (let i = 0; i < nT; i++) for (let j = 0; j < nP; j++) {
    const a = i * (nP + 1) + j, b = a + 1, c = a + nP + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

// ---- tapered tube with end caps (radius varies along the curve) ----
export function taperedTube(curve, r0, r1, segs = 48, radial = 10, color = null) {
  const frames = curve.computeFrenetFrames(segs, false);
  const pos = [], col = [], idx = [];
  const C = color ? new THREE.Color(color) : null;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, p = curve.getPointAt(t), r = lerp(r0, r1, Math.pow(t, 0.85));
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const n = frames.normals[i].clone().multiplyScalar(Math.cos(a)).add(frames.binormals[i].clone().multiplyScalar(Math.sin(a)));
      pos.push(p.x + n.x * r, p.y + n.y * r, p.z + n.z * r);
      if (C) col.push(C.r, C.g, C.b);
    }
  }
  for (let i = 0; i < segs; i++) for (let j = 0; j < radial; j++) {
    const a = i * radial + j, b = i * radial + ((j + 1) % radial), c = a + radial, d = b + radial;
    idx.push(a, c, b, b, c, d);
  }
  for (const [ring, p, flip] of [[0, curve.getPointAt(0), 1], [segs, curve.getPointAt(1), -1]]) {   // caps
    const ci = pos.length / 3; pos.push(p.x, p.y, p.z); if (C) col.push(C.r, C.g, C.b);
    for (let j = 0; j < radial; j++) {
      const a = ring * radial + j, b = ring * radial + ((j + 1) % radial);
      flip > 0 ? idx.push(ci, b, a) : idx.push(ci, a, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  if (C) g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

function blob(center, radii, color, rot = [0, 0, 0], seed = 0) {
  const g = new THREE.SphereGeometry(1, 44, 30);
  const p = g.attributes.position, col = [], base = new THREE.Color(color);
  const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rot));
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const bump = 1 + 0.05 * noise(v.x * 2 + seed, v.y * 2, v.z * 2) + 0.008 * noise(v.x * 6, v.y * 6 + seed, v.z * 6);
    v.set(v.x * radii[0] * bump, v.y * radii[1] * bump, v.z * radii[2] * bump).applyMatrix4(m).add(new THREE.Vector3(...center));
    p.setXYZ(i, v.x, v.y, v.z);
    const k = base.clone().multiplyScalar(0.9 + 0.2 * (0.5 + 0.5 * noise(v.x * 5, v.y * 5, v.z * 5)));
    col.push(k.r, k.g, k.b);
  }
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

const V = (...a) => new THREE.Vector3(...a);
const spline = (pts) => new THREE.CatmullRomCurve3(pts.map((p) => V(...p)), false, "centripetal");

// everything that is not a coronary artery: atria, auricles, great vessels
export function buildStatic() {
  const out = [];
  const add = (name, geometry) => out.push({ name, geometry });
  // atria + auricles
  add("right_atrium", blob([-0.78, 0.7, -0.05], [0.4, 0.52, 0.45], "#a1393f", [0, 0, 0], 1));
  add("right_auricle", blob([-0.42, 1.0, 0.5], [0.3, 0.2, 0.17], "#a8434a", [0, 0.5, -0.5], 2));
  add("left_atrium", blob([0.45, 0.95, -0.6], [0.5, 0.4, 0.38], "#963238", [0, 0, 0], 3));
  add("left_auricle", blob([0.7, 0.88, 0.2], [0.2, 0.17, 0.12], "#a8434a", [0, -0.6, 0.5], 4));
  // great vessels
  const aortaPts = [[0, 0.55, 0.12], [0, 1.0, 0.12], [0, 1.45, 0.1], [-0.05, 1.85, 0], [0.25, 2.12, -0.25],
                    [0.65, 2.0, -0.55], [0.85, 1.55, -0.72], [0.9, 0.9, -0.85]];
  const aorta = spline(aortaPts);
  add("aorta", taperedTube(aorta, 0.22, 0.17, 70, 16, "#d0716b"));
  [[0.34, -0.1], [0.42, 0.05], [0.5, 0.2]].forEach(([t, lean], i) => {          // arch branches
    const p = aorta.getPointAt(t);
    add(`arch_branch_${i}`, taperedTube(spline([[p.x, p.y + 0.1, p.z], [p.x + lean * 0.4, p.y + 0.35, p.z - 0.02],
      [p.x + lean, p.y + 0.62, p.z - 0.04]]), 0.075, 0.06, 12, 10, "#c9615c"));
  });
  add("pulmonary_trunk", taperedTube(spline([[0.28, 0.8, 0.55], [0.32, 1.3, 0.5], [0.42, 1.62, 0.25], [0.6, 1.76, -0.15]]),
    0.21, 0.17, 40, 14, "#8a96bd"));
  add("left_pa", taperedTube(spline([[0.6, 1.76, -0.15], [0.95, 1.74, -0.3], [1.3, 1.6, -0.42]]), 0.13, 0.1, 20, 10, "#8a96bd"));
  add("right_pa", taperedTube(spline([[0.6, 1.76, -0.15], [0.1, 1.72, -0.45], [-0.4, 1.6, -0.52]]), 0.13, 0.1, 20, 10, "#8a96bd"));
  add("svc", taperedTube(spline([[-0.72, 0.9, -0.02], [-0.74, 1.4, -0.05], [-0.72, 2.0, -0.08]]), 0.18, 0.15, 24, 12, "#8f87a8"));
  add("pv_left_upper", taperedTube(spline([[0.9, 1.0, -0.55], [1.2, 1.05, -0.58], [1.45, 1.1, -0.6]]), 0.09, 0.08, 12, 8, "#a3697a"));
  add("pv_left_lower", taperedTube(spline([[0.85, 0.75, -0.7], [1.15, 0.65, -0.8], [1.4, 0.55, -0.88]]), 0.09, 0.08, 12, 8, "#a3697a"));
  return out;
}

// ---------------------------------------------------------------------------------------------
// Interaction helpers
// ---------------------------------------------------------------------------------------------

// Which ventricle a point on the ventricular surface belongs to (left or right of the septum grooves).
export function ventricleSide(x, z) {
  let p = Math.atan2(x, z);
  while (p < PHI_A) p += Math.PI * 2;
  return p < PHI_P + Math.PI * 2 ? "lv" : "rv";
}

// Translucent RGBA vertex-colour overlay that sits on the ventricles (used for tint + hover/selection).
export function makeOverlay(base) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", base.attributes.position);
  g.setIndex(base.index);
  g.setAttribute("normal", base.attributes.normal);
  const pos = base.attributes.position, side = new Uint8Array(pos.count);
  for (let i = 0; i < pos.count; i++) side[i] = ventricleSide(pos.getX(i), pos.getZ(i)) === "lv" ? 0 : 1;
  g.userData.side = side;
  g.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(pos.count * 4), 4));
  return g;
}

export function paintOverlay(g, lv, rv) {
  const col = g.attributes.color, side = g.userData.side;
  for (let i = 0; i < side.length; i++) {
    const c = side[i] === 0 ? lv : rv;
    col.setXYZW(i, c[0], c[1], c[2], c[3]);
  }
  col.needsUpdate = true;
}

// One purely illustrative electrical cycle (seconds). The heartbeat and the conduction pulse share it.
export const CYCLE = 1.1;
export const beatAmount = (t) => 1 + 0.025 * Math.exp(-Math.pow(((t % CYCLE) - 0.85) / 0.1, 2));
