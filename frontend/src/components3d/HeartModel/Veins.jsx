import { useMemo } from "react";
import { taperedTube } from "./anatomy.js";
import { buildVeins } from "./veins.js";

const BLUE = "#5675d6";

// The cardiac veins as selectable, hoverable tubes. They are NOT linked to any prediction (the dataset has no
// vein measurements); they exist so the anatomy around the arteries is complete.
export default function Veins({ structure, hover, onHover, onSelect }) {
  const V = useMemo(buildVeins, []);
  const geos = useMemo(() => V.map((t) => taperedTube(t.curve, t.r0, t.r1, 48, 10)), [V]);
  const hits = useMemo(() => V.map((t) => taperedTube(t.curve, Math.max(t.r0 * 2, 0.07), Math.max(t.r1 * 2, 0.07), 20, 6)), [V]);
  const glow = (id) => (structure === id ? 0.95 : hover === id ? 0.8 : 0.3);
  return (
    <group name="veins">
      {V.map((t, i) => (
        <group key={t.id}
               onClick={(e) => { e.stopPropagation(); onSelect(t.id); }}
               onPointerMove={(e) => { e.stopPropagation(); onHover(t.id); }}
               onPointerOut={() => onHover(null)}>
          <mesh geometry={geos[i]} name={`vein-${t.id}`}>
            <meshStandardMaterial color={BLUE} emissive={BLUE} emissiveIntensity={glow(t.id)} roughness={0.45} />
          </mesh>
          <mesh geometry={hits[i]}><meshBasicMaterial transparent opacity={0} depthWrite={false} /></mesh>
        </group>
      ))}
    </group>
  );
}
