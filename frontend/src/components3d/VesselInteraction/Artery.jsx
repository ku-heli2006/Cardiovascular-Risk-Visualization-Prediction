import { useMemo } from "react";
import { Html } from "@react-three/drei";
import { taperedTube } from "../HeartModel/anatomy.js";
import { probabilityToColor, pct } from "../ProbabilityColorMapper/index.js";

// One coronary tree (main trunk + branches). Colour, hover, selection and click apply to the whole tree.
// colorOverride / labelOverride let the "what drove it" view tint the tree without touching risk colours.
export default function Artery({ id, vessel, probability, selected, hovered, onSelect, onHover, unavailable,
                                 colorOverride, labelOverride }) {
  const geos = useMemo(() => vessel.parts.map((p) => taperedTube(p.curve, p.r0, p.r1, 56, 10)), [vessel]);
  const halos = useMemo(() => selected ? vessel.parts.map((p) => taperedTube(p.curve, p.r0 * 1.9, p.r1 * 2.2, 40, 8)) : [],
    [vessel, selected]);
  const hits = useMemo(() => vessel.parts.map((p) =>                         // fat invisible tubes: easier to click
    taperedTube(p.curve, Math.max(p.r0 * 2, 0.07), Math.max(p.r1 * 3, 0.06), 24, 6)), [vessel]);
  const color = colorOverride ?? (unavailable ? "hsl(215, 10%, 58%)" : probabilityToColor(probability));
  const label = labelOverride ?? `${vessel.label} ${unavailable ? "n/a" : pct(probability)}`;
  const mid = vessel.parts[0].curve.getPointAt(vessel.labelAt);
  const cursor = (v) => { document.body.style.cursor = v; };

  return (
    <group name={`vessel-${id}`}
           onClick={(e) => { e.stopPropagation(); onSelect(id); }}
           onPointerMove={(e) => { e.stopPropagation(); onHover?.(id); }}
           onPointerOver={(e) => { e.stopPropagation(); cursor("pointer"); }}
           onPointerOut={() => { cursor("auto"); onHover?.(null); }}>
      {halos.map((g, i) => (
        <mesh key={`h${i}`} geometry={g}><meshBasicMaterial color="#ffffff" transparent opacity={0.3} depthWrite={false} /></mesh>))}
      {geos.map((g, i) => (
        <mesh key={i} geometry={g} name={`${id}-part-${i}`}>
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={selected || hovered ? 0.8 : 0.3}
                                roughness={0.4} />
        </mesh>))}
      {hits.map((g, i) => (
        <mesh key={`x${i}`} geometry={g}><meshBasicMaterial transparent opacity={0} depthWrite={false} /></mesh>))}
      <Html position={mid} center distanceFactor={5} style={{ pointerEvents: "none" }}>
        <div className={`vlabel ${selected ? "sel" : ""}`} style={{ borderColor: color }}>{label}</div>
      </Html>
    </group>
  );
}
