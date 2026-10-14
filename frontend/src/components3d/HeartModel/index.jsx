import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import Artery from "../VesselInteraction/Artery.jsx";
import { VESSELS } from "../VesselInteraction/vessels.js";
import Conduction from "./Conduction.jsx";
import Veins from "./Veins.jsx";
import { beatAmount, buildBody, buildStatic, makeOverlay, paintOverlay, ventricleSide } from "./anatomy.js";
import { STRUCTURES, VESSEL_IDS, firstSentence, structureOfPart } from "./structures.js";
import { attributionColor, fmtNet } from "../../utils/attribution.js";
import { pct, probabilityToColor, riskBand } from "../ProbabilityColorMapper/index.js";

const HOME = { point: [0, 0.35, 0], zoom: 8.4 };
const mix = (a, b, t) => a + (b - a) * t;

// Beat is cosmetic and shares one illustrative cycle with the conduction pulse. It is NOT patient-derived.
function Beat({ animate, children }) {
  const ref = useRef();
  useFrame(({ clock }) => ref.current?.scale.setScalar(animate ? beatAmount(clock.elapsedTime) : 1));
  return <group ref={ref}>{children}</group>;
}

// Smoothly moves the orbit target (and the camera with it) to the selected structure.
function Rig({ groupRef, controlsRef, focus }) {
  const { camera } = useThree();
  const goal = useRef(new THREE.Vector3());
  const zoom = useRef(null);
  const active = useRef(false);
  useEffect(() => {
    if (!focus || !groupRef.current) return;
    groupRef.current.updateWorldMatrix(true, false);
    goal.current.copy(groupRef.current.localToWorld(new THREE.Vector3(...focus.point)));
    zoom.current = focus.zoom ?? null;
    active.current = true;
  }, [focus, groupRef]);
  useFrame(() => {
    const c = controlsRef.current;
    if (!c || !active.current) return;
    const d = goal.current.clone().sub(c.target).multiplyScalar(0.12);
    c.target.add(d);
    camera.position.add(d);
    const off = camera.position.clone().sub(c.target);
    const len = off.length(), want = zoom.current ?? len;
    off.setLength(len + (want - len) * 0.12);
    camera.position.copy(c.target).add(off);
    c.update();
    if (goal.current.distanceTo(c.target) < 0.003 && Math.abs(want - len) < 0.01) active.current = false;
  });
  return null;
}

export function HeartScene({
  probabilities, cad, selected, structure, hover, onHover, onSelectStructure, unavailable = [],
  mode = "risk", tint = {}, labels = {}, layers, seeThrough = false, animate = true, focus, controlsRef,
}) {
  const L = layers ?? { muscle: true, great: true, coronary: true, veins: false, conduction: false };
  const groupRef = useRef();
  const fallbackControls = useRef();
  const body = useMemo(buildBody, []);
  const overlay = useMemo(() => makeOverlay(body), [body]);
  const parts = useMemo(buildStatic, []);
  const cadColor = cad == null ? null : probabilityToColor(cad);
  const xray = seeThrough || L.conduction;

  // tint + hover + selection on the two ventricles
  useEffect(() => {
    const rgba = (id) => {
      let c = [0, 0, 0, 0];
      if (tint[id]) { const k = new THREE.Color(tint[id]); c = [k.r, k.g, k.b, 0.62]; }
      if (hover === id) c = [mix(c[0], 1, 0.4), mix(c[1], 1, 0.4), mix(c[2], 1, 0.4), Math.max(c[3], 0.25)];
      if (structure === id) c = [mix(c[0], 1, 0.55), mix(c[1], 1, 0.55), mix(c[2], 1, 0.55), Math.max(c[3], 0.38)];
      return c;
    };
    paintOverlay(overlay, rgba("lv"), rgba("rv"));
  }, [overlay, tint, hover, structure]);

  const sideOf = (e) => { const p = e.object.worldToLocal(e.point.clone()); return ventricleSide(p.x, p.z); };
  const glow = (sid) => tint[sid] ? { c: tint[sid], i: hover === sid || structure === sid ? 0.85 : 0.55 }
    : structure === sid ? { c: "#ffffff", i: 0.35 } : hover === sid ? { c: "#ffffff", i: 0.25 } : { c: "#000000", i: 0 };

  return (
    <>
      <ambientLight intensity={0.85} />
      <directionalLight position={[3, 4, 5]} intensity={1.5} />
      <directionalLight position={[-4, -1, -3]} intensity={0.55} />
      <hemisphereLight args={["#ffffff", "#402030", 0.45]} />
      <group ref={groupRef} position={[0, -0.55, 0]} rotation={[0.12, -0.4, 0.3]}>
        <Beat animate={animate}>
          {L.muscle && (
            <>
              <mesh geometry={body} name="ventricles"
                    onClick={(e) => { e.stopPropagation(); onSelectStructure(sideOf(e)); }}
                    onPointerMove={(e) => { e.stopPropagation(); onHover(sideOf(e)); }}
                    onPointerOut={() => onHover(null)}>
                <meshStandardMaterial vertexColors roughness={0.5} metalness={0.05} transparent={xray}
                                      opacity={xray ? 0.26 : 1} depthWrite={!xray}
                                      emissive={mode === "risk" && cadColor ? cadColor : "#000000"}
                                      emissiveIntensity={mode === "risk" && cadColor ? 0.1 : 0} />
              </mesh>
              <mesh geometry={overlay} name="ventricle-overlay" scale={1.004} raycast={() => null}>
                <meshBasicMaterial vertexColors transparent depthWrite={false} polygonOffset polygonOffsetFactor={-2} />
              </mesh>
              {mode === "risk" && cadColor && (   // overall-CAD glow shell in the CAD colour
                <mesh geometry={body} scale={1.07} name="cad-aura" raycast={() => null}>
                  <meshBasicMaterial color={cadColor} side={THREE.BackSide} transparent
                                     opacity={structure === "heart" ? 0.55 : 0.32} depthWrite={false} />
                </mesh>)}
            </>
          )}
          {parts.map((p) => {
            const sid = structureOfPart(p.name);
            const group = STRUCTURES[sid]?.group;
            if ((group === "chamber" && !L.muscle) || (group === "vessel" && !L.great)) return null;
            const g = glow(sid);
            const thin = xray && group === "chamber";
            return (
              <mesh key={p.name} geometry={p.geometry} name={p.name}
                    onClick={(e) => { e.stopPropagation(); onSelectStructure(sid); }}
                    onPointerMove={(e) => { e.stopPropagation(); onHover(sid); }}
                    onPointerOut={() => onHover(null)}>
                <meshStandardMaterial vertexColors roughness={0.55} emissive={g.c} emissiveIntensity={g.i}
                                      transparent={thin} opacity={thin ? 0.5 : 1} depthWrite={!thin} />
              </mesh>
            );
          })}
          {L.coronary && Object.entries(VESSELS).map(([id, v]) => (
            <Artery key={id} id={id} vessel={v} probability={probabilities?.[id] ?? null}
                    selected={structure === id} hovered={hover === id} onSelect={onSelectStructure} onHover={onHover}
                    unavailable={unavailable.includes(id)}
                    colorOverride={mode === "attribution" ? (tint[id] ?? "hsl(215, 10%, 58%)") : undefined}
                    labelOverride={mode === "attribution" ? `${v.label} ${labels[id] ?? ""}`.trim() : undefined} />))}
          {L.veins && <Veins structure={structure} hover={hover} onHover={onHover} onSelect={onSelectStructure} />}
          {L.conduction && (
            <Conduction structure={structure} hover={hover} onHover={onHover} onSelect={onSelectStructure}
                        animate={animate} tint={mode === "attribution" ? tint : null} />)}
        </Beat>
      </group>
      <Rig groupRef={groupRef} controlsRef={controlsRef ?? fallbackControls} focus={focus} />
      <OrbitControls ref={controlsRef ?? fallbackControls} enablePan={false} minDistance={3} maxDistance={12}
                     target={[0, -0.2, 0]} makeDefault />
    </>
  );
}

const focusFor = (id) => {
  const s = STRUCTURES[id];
  if (!s) return HOME;
  if (VESSEL_IDS.includes(id)) {
    const p = VESSELS[id].parts[0].curve.getPointAt(0.45);
    return { point: [p.x, p.y, p.z], zoom: s.zoom };
  }
  return { point: s.focus ?? HOME.point, zoom: s.zoom ?? HOME.zoom };
};

const LAYER_LABEL = { muscle: "Heart muscle", great: "Great vessels", coronary: "Coronary arteries",
  veins: "Cardiac veins", conduction: "Conduction system" };

export default function Heart3D({
  probabilities, cad, structure, onSelectStructure, unavailable = [], attribution = {}, attributionUnit,
}) {
  const [hover, setHover] = useState(null);
  const [mode, setMode] = useState("risk");
  const [layers, setLayers] = useState({ muscle: true, great: true, coronary: true, veins: false, conduction: false });
  const [seeThrough, setSeeThrough] = useState(false);
  const [animate, setAnimate] = useState(true);
  const [focus, setFocus] = useState(null);
  const controls = useRef();
  const wrap = useRef();
  const tip = useRef();

  // fly to whatever is selected (3D click, card click, or inspector chip) and make sure it is visible
  useEffect(() => {
    if (!structure) return;
    setFocus({ ...focusFor(structure), key: structure });
    const g = STRUCTURES[structure]?.group;
    if (g === "conduction") setLayers((l) => (l.conduction ? l : { ...l, conduction: true }));
    if (g === "vein") setLayers((l) => (l.veins ? l : { ...l, veins: true }));
    if (g === "coronary") setLayers((l) => (l.coronary ? l : { ...l, coronary: true }));
  }, [structure]);

  const maxAbs = useMemo(() => Math.max(1e-9, ...Object.values(attribution).map((a) => Math.abs(a.net))), [attribution]);
  const tint = useMemo(() => mode !== "attribution" ? {} : Object.fromEntries(
    Object.entries(attribution).map(([id, a]) => [id, attributionColor(a.net, maxAbs)])), [mode, attribution, maxAbs]);
  const labels = useMemo(() => Object.fromEntries(
    Object.entries(attribution).map(([id, a]) => [id, fmtNet(a.net, attributionUnit)])), [attribution, attributionUnit]);

  const move = (e) => {
    const r = wrap.current?.getBoundingClientRect();
    if (r && tip.current) tip.current.style.transform = `translate(${e.clientX - r.left + 14}px, ${e.clientY - r.top + 14}px)`;
  };
  const hs = hover ? STRUCTURES[hover] : null;
  const toggle = (k) => setLayers((l) => ({ ...l, [k]: !l[k] }));
  const hasAttr = Object.keys(attribution).length > 0;

  return (
    <div className="heart-wrap" ref={wrap} onPointerMove={move}>
      <Canvas dpr={[1, 1.5]} camera={{ position: [0, 0.4, 8.4], fov: 40 }}
              gl={{ antialias: true, powerPreference: "low-power" }}>
        <HeartScene probabilities={probabilities} cad={cad} structure={structure} hover={hover} onHover={setHover}
                    onSelectStructure={onSelectStructure} unavailable={unavailable} mode={mode} tint={tint}
                    labels={labels} layers={layers} seeThrough={seeThrough} animate={animate} focus={focus}
                    controlsRef={controls} />
      </Canvas>

      <div className="hud hud-tl">
        <div className="seg">
          <button className={mode === "risk" ? "on" : ""} onClick={() => setMode("risk")}>Risk view</button>
          <button className={mode === "attribution" ? "on" : ""} onClick={() => setMode("attribution")}>What drove it</button>
        </div>
        <div className="layers">
          {Object.keys(LAYER_LABEL).map((k) => (
            <label key={k}><input type="checkbox" checked={layers[k]} onChange={() => toggle(k)} /> {LAYER_LABEL[k]}</label>))}
          <label><input type="checkbox" checked={seeThrough} onChange={() => setSeeThrough((v) => !v)} /> See-through</label>
          <label><input type="checkbox" checked={animate} onChange={() => setAnimate((v) => !v)} /> Animate (illustrative)</label>
        </div>
      </div>

      {mode === "risk" && cad != null && (
        <div className="cad-badge" style={{ borderColor: probabilityToColor(cad) }}>
          <small>Overall CAD · model estimate</small>
          <b style={{ color: probabilityToColor(cad) }}>{pct(cad)}</b>
          <small>{riskBand(cad)}</small>
        </div>)}

      <button className="reset" onClick={() => { setFocus({ ...HOME, key: Math.random() }); onSelectStructure("heart"); }}>Reset view</button>

      <div ref={tip} className="tip" style={{ display: hs ? "block" : "none" }}>
        {hs && (<><b>{hs.name}</b><span>{firstSentence(hs.role)}</span><em>Click to inspect</em></>)}
      </div>

      {mode === "risk" ? (
        <div className="legend">
          <span>0%</span>
          <i style={{ background: `linear-gradient(90deg, ${probabilityToColor(0)}, ${probabilityToColor(0.5)}, ${probabilityToColor(1)})` }} />
          <span>100%</span><small>glow = overall CAD estimate · arteries = vessel stenosis estimate (grey = no vessel model)</small>
        </div>
      ) : (
        <div className="legend">
          <span style={{ color: "#6aa9f0" }}>lowered</span>
          <i style={{ background: `linear-gradient(90deg, ${attributionColor(-1, 1)}, ${attributionColor(0, 1)}, ${attributionColor(1, 1)})` }} />
          <span style={{ color: "#f08a84" }}>raised</span>
          <small>{hasAttr
            ? "net effect of each region's related measurements on the overall CAD estimate. Not a damage map."
            : "Run a prediction to see which regions' measurements drove the estimate."}</small>
        </div>
      )}
    </div>
  );
}
