// Schematic cardiac veins (the heart's own drainage), in the same heart coordinates as anatomy.js.
// Illustrative anatomy only. They run beside the coronary arteries (see vessels.js) in the same grooves.
import * as THREE from "three";
import { surfacePoint } from "./anatomy.js";

const path = (pairs, off = 0.032) =>
  new THREE.CatmullRomCurve3(pairs.map(([c, p]) => surfacePoint(c, p, off)), false, "centripetal");

// phi values above PI continue round the back of the heart (3.5 is the same direction as 3.5 - 2*PI)
export function buildVeins() {
  return [
    // beside the LAD up the front, then along the left AV groove next to the LCX, joining the coronary sinus
    { id: "gcv", r0: 0.022, r1: 0.05, curve: path([[-0.8, 0.52], [-0.5, 0.6], [-0.2, 0.64], [0.1, 0.68], [0.35, 0.76],
        [0.56, 0.95], [0.56, 1.4], [0.56, 1.9], [0.56, 2.4], [0.57, 2.9]]) },
    // up the underside beside the posterior descending artery
    { id: "mcv", r0: 0.02, r1: 0.04, curve: path([[-0.85, -2.52], [-0.55, -2.54], [-0.2, -2.56], [0.15, -2.58],
        [0.4, -2.6], [0.58, -2.62]]) },
    // wide trunk on the back of the heart that empties into the right atrium
    { id: "cs", r0: 0.06, r1: 0.075, curve: path([[0.57, 2.9], [0.58, 3.2], [0.6, 3.5], [0.62, 3.78]]) },
  ];
}
