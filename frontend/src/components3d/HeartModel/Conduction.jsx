import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { taperedTube, CYCLE } from "./anatomy.js";
import { buildConduction } from "./conduction.js";

const GOLD = "#f2c94c";

// The electrical conduction system with an optional illustrative signal that travels
// SA node -> atria -> AV node (delay) -> His bundle -> bundle branches -> Purkinje fibres.
export default function Conduction({ structure, hover, onHover, onSelect, animate, tint }) {
  const C = useMemo(buildConduction, []);
  const geos = useMemo(() => C.tubes.map((t) => taperedTube(t.curve, t.r0, t.r1, 40, 8)), [C]);
  const hits = useMemo(() => C.tubes.map((t) => taperedTube(t.curve, 0.06, 0.05, 20, 6)), [C]);
  const pulses = useRef([]);
  const nodeMats = useRef([]);

  useFrame(({ clock }) => {
    const c = animate ? clock.elapsedTime % CYCLE : -1;
    C.tubes.forEach((t, i) => {
      const m = pulses.current[i];
      if (!m) return;
      const on = c >= t.t0 && c <= t.t1;
      m.visible = on;
      if (on) m.position.copy(t.curve.getPointAt((c - t.t0) / (t.t1 - t.t0)));
    });
    C.nodes.forEach((n, i) => {
      const mat = nodeMats.current[i];
      if (mat) mat.emissiveIntensity = 0.5 + (c >= n.t0 && c <= n.t1 ? 1.8 : 0);
    });
  });

  const bind = (id) => ({
    onClick: (e) => { e.stopPropagation(); onSelect(id); },
    onPointerMove: (e) => { e.stopPropagation(); onHover(id); },
    onPointerOut: () => onHover(null),
  });
  const colorOf = (id) => tint?.[id] ?? GOLD;
  const glow = (id) => (structure === id ? 1.0 : hover === id ? 0.85 : 0.5);

  return (
    <group name="conduction">
      {C.tubes.map((t, i) => (
        <group key={i} {...bind(t.id)}>
          <mesh geometry={geos[i]} name={`conduction-${t.id}`}>
            <meshStandardMaterial color={colorOf(t.id)} emissive={colorOf(t.id)} emissiveIntensity={glow(t.id)}
                                  roughness={0.35} />
          </mesh>
          <mesh geometry={hits[i]}><meshBasicMaterial transparent opacity={0} depthWrite={false} /></mesh>
        </group>
      ))}
      {C.nodes.map((n, i) => (
        <mesh key={n.id} position={n.p} name={`node-${n.id}`} {...bind(n.id)}>
          <sphereGeometry args={[n.r, 24, 18]} />
          <meshStandardMaterial ref={(m) => (nodeMats.current[i] = m)} color={colorOf(n.id)}
                                emissive={colorOf(n.id)} emissiveIntensity={glow(n.id)} roughness={0.3} />
        </mesh>
      ))}
      {C.tubes.map((t, i) => (
        <mesh key={`p${i}`} ref={(m) => (pulses.current[i] = m)} visible={false} raycast={() => null}>
          <sphereGeometry args={[0.05, 14, 10]} />
          <meshBasicMaterial color="#ffffff" />
        </mesh>
      ))}
    </group>
  );
}
