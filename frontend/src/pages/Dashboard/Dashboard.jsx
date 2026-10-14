import { useEffect, useMemo, useState } from "react";
import StructureInspector from "../../components/StructureInspector/index.jsx";
import { computeAttribution } from "../../utils/attribution.js";
import { VESSEL_IDS } from "../../components3d/HeartModel/structures.js";
import ClinicalDashboard from "../../components/ClinicalDashboard/index.jsx";
import ModelEvaluation from "../../components/ModelEvaluation/index.jsx";
import PatientInput from "../../components/PatientInput/index.jsx";
import PhysiologicalPanel from "../../components/PhysiologicalPanel/index.jsx";
import RiskCards from "../../components/RiskCards/index.jsx";
import SafetyDisclaimer from "../../components/SafetyDisclaimer/index.jsx";
import SHAPChart from "../../components/SHAPChart/index.jsx";
import VesselPanel from "../../components/VesselPanel/index.jsx";
import WhatIfPanel from "../../components/WhatIfPanel/index.jsx";
import Heart3D from "../../components3d/HeartModel/index.jsx";
import { usePrediction } from "../../hooks/usePrediction.js";
import { useVesselSelection } from "../../hooks/useVesselSelection.js";
import { api } from "../../services/api.js";

export default function Dashboard() {
  const [schema, setSchema] = useState(null);
  const [health, setHealth] = useState(null);
  const [evaluation, setEvaluation] = useState(null);
  const [caseCount, setCaseCount] = useState(0);
  const [mode, setMode] = useState("dataset");
  const [features, setFeatures] = useState({});
  const [caseInfo, setCaseInfo] = useState(null);
  const [recorded, setRecorded] = useState(null);
  const [apiError, setApiError] = useState(null);
  const { selected: structure, select: setStructure } = useVesselSelection("heart");
  // dashboard cards / SHAP / vessel panel work on targets (cad, lad, lcx, rca); other structures explain overall CAD
  const selected = VESSEL_IDS.includes(structure) ? structure : "cad";
  const select = (t) => setStructure(t === "cad" ? "heart" : t);
  const unavailable = useMemo(() => health?.unavailable_targets ?? [], [health]);
  const { prediction, submitted, explanations, loading, error, run, loadExplanation } = usePrediction();

  useEffect(() => {
    api.health().then(setHealth).catch((e) => setApiError(`Cannot reach the API (${e.message}). Start the backend first.`));
    api.schema().then(setSchema).catch(() => {});
    api.evaluation().then(setEvaluation).catch(() => {});
    api.caseCount().then((c) => setCaseCount(c.count)).catch(() => {});
  }, []);

  // selection drives the explanation: 3D click / card click -> same state -> same panels
  useEffect(() => { if (prediction && !unavailable.includes(selected)) loadExplanation(selected); },
    [prediction, selected, unavailable, loadExplanation]);

  const loadCase = async (i) => {
    try {
      const c = await api.caseById(i);
      setFeatures(c.features); setRecorded(c.recorded_labels);
      setCaseInfo(`De-identified dataset record #${i} (real recorded data, not synthetic)`);
      run(c.features, { source: "dataset", caseId: c.case_id });
    } catch (e) { setApiError(e.message); }
  };
  const runManual = () => { setCaseInfo(mode === "manual" ? "Manual input" : caseInfo); setRecorded(null);
    run(features, { source: mode === "manual" ? "manual" : "dataset", caseId: null }); };

  const probs = prediction ? { lad: prediction.lad?.probability ?? null, lcx: prediction.lcx?.probability ?? null, rca: prediction.rca?.probability ?? null } : null;
  const exp = explanations[selected];
  const cadExp = explanations.cad;
  const attribution = useMemo(() => computeAttribution(cadExp), [cadExp]);
  // the inspector and the "what drove it" view always explain OVERALL CAD, so make sure it is loaded
  useEffect(() => { if (prediction && !unavailable.includes("cad")) loadExplanation("cad"); }, [prediction, unavailable, loadExplanation]);

  return (
    <div className="app">
      <header><h1>Cardiovascular Risk Visualization</h1>
        <span className="muted">Multi-vessel CAD prediction with explainable AI</span></header>
      <SafetyDisclaimer />
      {(apiError || error) && <div className="error">{apiError || error}</div>}
      {health && !health.models_ready && <div className="error">Models are not trained yet. Run the trainer, then restart the API.</div>}
      {unavailable.length > 0 && health?.models_ready && (
        <div className="warn-banner">Vessel-level labels ({unavailable.map((t) => t.toUpperCase()).join(", ")}) were not in
          the training dataset, so only overall CAD is predicted. Those arteries stay grey. Use the Extension of
          Z-Alizadeh Sani dataset and retrain to enable them.</div>
      )}
      <ClinicalDashboard
        left={schema && <PatientInput schema={schema} features={features} setFeatures={setFeatures} mode={mode}
              setMode={(m) => { setMode(m); setCaseInfo(null); }} caseCount={caseCount} onLoadCase={loadCase}
              onRun={runManual} loading={loading} caseInfo={caseInfo} />}
        center={<div className="panel"><Heart3D probabilities={probs} cad={prediction?.cad?.probability ?? null} structure={structure}
                 onSelectStructure={setStructure} unavailable={unavailable} attribution={attribution}
                 attributionUnit={cadExp?.unit} />
          <StructureInspector structure={structure} onSelect={setStructure} prediction={prediction}
            unavailable={unavailable} explanation={cadExp} submitted={submitted} attribution={attribution} />
          {prediction?.warnings?.length > 0 && <div className="warn">{prediction.warnings.map((w) => <div key={w}>⚠ {w}</div>)}</div>}</div>}
        right={<div className="panel"><RiskCards prediction={prediction} selected={selected} onSelect={select} unavailable={unavailable} />
          <VesselPanel target={selected} prediction={prediction} explanation={exp} health={health} unavailable={unavailable}
            calibration={evaluation?.calibration?.[selected]} />
          {recorded && <div className="muted small">Recorded dataset labels (comparison only, never a model input): {
            Object.entries(recorded).map(([k, v]) => `${k.toUpperCase()}=${v}`).join(" · ")}</div>}</div>}
        bottom={<>
          <div className="panel"><h3>Physiological measurements</h3>
            <PhysiologicalPanel explanation={exp} schema={schema} features={submitted?.features} /></div>
          <div className="panel"><h3>Why this estimate? (SHAP)</h3><SHAPChart explanation={exp} target={selected} /></div>
          <div className="panel"><h3>What if one measurement were different? (model sensitivity)</h3>
            <WhatIfPanel schema={schema} submitted={submitted} target={selected} unavailable={unavailable} /></div>
          <div className="panel"><h3>Model evaluation / validation</h3><ModelEvaluation evaluation={evaluation} /></div>
        </>} />
      <footer className="muted small">Decision-support / educational prototype. Outputs are statistical estimates from a
        single 303-patient dataset and do not constitute a diagnosis or treatment recommendation.</footer>
    </div>
  );
}
