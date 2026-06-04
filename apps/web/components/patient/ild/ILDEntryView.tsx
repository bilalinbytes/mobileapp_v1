"use client";

import { useState } from "react";
import { RefreshCw, CheckCircle, AlertCircle } from "lucide-react";
import { MMRCPicker, SubmitBtn, SuccessScreen } from "@/components/patient/shared";
import dStyles from "@/components/patient/disease.module.css";
import styles from "./ILD.module.css";

// ── K-BILD Questions ──────────────────────────────────────────────────────────
const KBILD_QUESTIONS = [
  "In the last 2 weeks, I have been breathless climbing stairs or walking up an incline or hill.",
  "In the last 2 weeks, because of my lung condition, my chest has felt tight.",
  "In the last 2 weeks have you worried about the seriousness of your lung complaint?",
  "In the last 2 weeks have you avoided doing things that make you breathless?",
  "In the last 2 weeks have you felt in control of your lung condition?",
  "In the last 2 weeks, has your lung complaint made you feel fed up or down in the dumps?",
  "In the last 2 weeks, I have felt the urge to breathe, also known as 'air hunger'.",
  "In the last 2 weeks, my lung condition has made me feel anxious.",
  "In the last 2 weeks, how often have you experienced 'wheeze' or whistling sounds from your chest?",
  "In the last 2 weeks, how much of the time have you felt your lung disease is getting worse?",
  "In the last 2 weeks has your lung condition interfered with your job or other daily tasks?",
  "In the last 2 weeks have you expected your lung complaint to get worse?",
  "In the last 2 weeks, how much has your lung condition limited you carrying things, for example, groceries?",
  "In the last 2 weeks, has your lung condition made you think more about the end of your life?",
  "Are you financially worse off because of your lung condition?",
];

const KBILD_SCALE = [
  "All of the time",
  "Most of the time",
  "A good bit of the time",
  "Some of the time",
  "A little of the time",
  "Hardly any of the time",
  "None of the time",
];

const Q15_SCALE = [
  "A significant amount",
  "A large amount",
  "A considerable amount",
  "A reasonable amount",
  "A small amount",
  "Hardly at all",
  "Not at all",
];

const SYMPTOMS = [
  { id: "cough",         label: "Cough" },
  { id: "expectoration", label: "Expectoration" },
  { id: "breathlessness",label: "Breathlessness" },
  { id: "chestPain",     label: "Chest Pain" },
  { id: "haemoptysis",   label: "Haemoptysis" },
  { id: "fever",         label: "Fever" },
  { id: "covid",         label: "Covid Symptoms" },
];

const ILD_SIDE_EFFECTS = ["Nausea", "Vomiting", "Diarrhea", "Fever", "Headache", "Abdominal Pain", "Rashes"];

interface Props {
  patient: {
    name: string; doctor: string; aqiToday: number;
    spo2Today: number; mmrcToday: number; diagnosis: string;
  };
}

function ScaleSelector({ value, onChange, scale }: {
  value: number | null; onChange: (v: number) => void; scale: string[];
}) {
  return (
    <div className={styles.scaleWrap}>
      {scale.map((label, i) => (
        <button key={i} type="button"
          className={`${styles.scaleOpt} ${value === i + 1 ? styles.scaleOptActive : ""}`}
          onClick={() => onChange(i + 1)}
        >
          <span className={styles.scaleNum}>{i + 1}</span>
          <span className={styles.scaleLabel}>{label}</span>
        </button>
      ))}
    </div>
  );
}

function SymptomSlider({ label, value, onChange }: {
  label: string; value: number; onChange: (v: number) => void;
}) {
  const color = value >= 7 ? "#e24b4a" : value >= 4 ? "#ef9f27" : "#0f6e56";
  return (
    <div className={styles.symptomRow}>
      <div className={styles.symptomLeft}>
        <span className={styles.symptomLabel}>{label}</span>
        <span className={styles.symptomVal} style={{ color }}>{value}</span>
      </div>
      <div className={styles.sliderWrap}>
        <input type="range" min="0" max="10" value={value}
          className={styles.slider}
          style={{ "--thumb-color": color } as React.CSSProperties}
          onChange={e => onChange(Number(e.target.value))}
        />
        <div className={styles.sliderLabels}>
          <span>0 None</span><span>5</span><span>10 Severe</span>
        </div>
      </div>
    </div>
  );
}

export function ILDEntryView({ patient }: Props) {
  const [aqi, setAqi] = useState(patient.aqiToday);
  const [spo2Rest, setSpo2Rest] = useState("");
  const [spo2Exertion, setSpo2Exertion] = useState("");
  const [mmrc, setMmrc] = useState<number | null>(null);
  const [symptoms, setSymptoms] = useState<Record<string, number>>(
    Object.fromEntries(SYMPTOMS.map(s => [s.id, 0]))
  );
  const [sideEffects, setSideEffects] = useState<Set<string>>(new Set());
  const [kbild, setKbild] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState(false);

  const toggleSE = (id: string) => setSideEffects(p => {
    const n = new Set(p);
    if (n.has(id)) {
      n.delete(id);
    } else {
      n.add(id);
    }
    return n;
  });
  const setKbildQ = (q: number, v: number) => setKbild(p => ({ ...p, [q]: v }));

  // K-BILD score: sum of answered questions, normalized 0–100
  const answeredCount = Object.keys(kbild).length;
  const kbildSum = Object.values(kbild).reduce((a, b) => a + b, 0);
  const kbildScore = answeredCount > 0 ? Math.round((kbildSum / (answeredCount * 7)) * 100) : null;

  const aqiColor = aqi > 150 ? "#e24b4a" : aqi > 100 ? "#ef9f27" : "#639922";
  const aqiLabel = aqi > 200 ? "Very Poor" : aqi > 150 ? "Unhealthy" : aqi > 100 ? "Moderate" : "Good";

  const canSubmit = spo2Rest !== "" && mmrc !== null;

  if (submitted) return <SuccessScreen onReset={() => setSubmitted(false)} />;

  return (
    <div className={dStyles.view}>
      {/* Header */}
      <div className={dStyles.pageHeader}>
        <div>
          <h1 className={dStyles.pageTitle}>Daily Check-In — ILD</h1>
          <p className={dStyles.pageSub}>
            {new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" })} · {new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} · Patient: {patient.name.split(" ")[0]}
          </p>
        </div>
        {kbildScore !== null && (
          <div className={styles.kbildBadge}>
            <span className={styles.kbildBadgeVal}>{kbildScore}</span>
            <span className={styles.kbildBadgeLbl}>K-BILD Score</span>
          </div>
        )}
      </div>

      <div className={dStyles.body}>
        {/* 1. AQI */}
        <div className={dStyles.card}>
          <div className={styles.aqiRow}>
            <div>
              <p className={dStyles.cardTitle}>Air Quality Index (AQI)</p>
              <p className={dStyles.cardSub}>Auto-fetched from your location</p>
            </div>
            <div className={styles.aqiRight}>
              <span className={styles.aqiVal} style={{ color: aqiColor }}>{aqi}</span>
              <span className={styles.aqiLabel} style={{ color: aqiColor }}>{aqiLabel}</span>
              <button type="button" className={styles.refreshBtn} onClick={() => setAqi(Math.floor(Math.random() * 100) + 50)} title="Refresh AQI">
                <RefreshCw size={13} />
              </button>
            </div>
          </div>
        </div>

        {/* 2. Vitals — SpO2 */}
        <div className={dStyles.card}>
          <p className={dStyles.cardTitle}>Vitals — SpO₂</p>
          <p className={dStyles.cardSub}>Measure with your pulse oximeter</p>
          <div className={dStyles.grid2}>
            <div>
              <label className={dStyles.fieldLabel}>Rest (Max) <span className={dStyles.req}>*</span></label>
              <div style={{ position: "relative" }}>
                <input type="number" min="70" max="100" className={dStyles.numInput}
                  placeholder="e.g. 94" value={spo2Rest}
                  onChange={e => setSpo2Rest(e.target.value)}
                  style={spo2Rest && Number(spo2Rest) < 90 ? { borderColor: "#e24b4a" } : {}}
                />
                <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", fontSize: 16, fontWeight: 600, color: "#888680", fontFamily: "var(--font-dm-sans)" }}>%</span>
              </div>
              {spo2Rest && Number(spo2Rest) < 90 && (
                <p style={{ fontSize: 11, color: "#e24b4a", marginTop: 4, display: "flex", alignItems: "center", gap: 4, fontFamily: "var(--font-dm-sans)" }}>
                  <AlertCircle size={11} /> Below target — contact your doctor
                </p>
              )}
            </div>
            <div>
              <label className={dStyles.fieldLabel}>Exertion (Min)</label>
              <div style={{ position: "relative" }}>
                <input type="number" min="70" max="100" className={dStyles.numInput}
                  placeholder="e.g. 88" value={spo2Exertion}
                  onChange={e => setSpo2Exertion(e.target.value)}
                />
                <span style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", fontSize: 16, fontWeight: 600, color: "#888680", fontFamily: "var(--font-dm-sans)" }}>%</span>
              </div>
            </div>
          </div>
        </div>

        {/* 3. mMRC */}
        <div className={dStyles.card}>
          <p className={dStyles.cardTitle}>mMRC Breathlessness Grade <span className={dStyles.req}>*</span></p>
          <p className={dStyles.cardSub}>The Modified Medical Research Council Dyspnoea Scale</p>
          <MMRCPicker value={mmrc} onChange={setMmrc} />
        </div>

        {/* 4. Medications + Side Effects */}
        <div className={dStyles.card}>
          <p className={dStyles.cardTitle}>Medications</p>
          <div className={styles.medDisplay}>
            <div className={styles.medPill}>
              <CheckCircle size={14} color="#4527a0" />
              <span>Nintedanib</span>
            </div>
          </div>
          <p className={styles.seTitle}>Side Effects — Select all that apply</p>
          <div className={styles.seGrid}>
            {ILD_SIDE_EFFECTS.map(se => (
              <button key={se} type="button"
                className={`${styles.seChip} ${sideEffects.has(se) ? styles.seChipActive : ""}`}
                onClick={() => toggleSE(se)}
              >
                {sideEffects.has(se) && <CheckCircle size={11} strokeWidth={2.5} />}
                {se}
              </button>
            ))}
          </div>
        </div>

        {/* 5. Symptoms 0–10 */}
        <div className={dStyles.card}>
          <p className={dStyles.cardTitle}>Symptoms</p>
          <p className={dStyles.cardSub}>Rate each symptom from 0 (None) to 10 (Severe)</p>
          <div className={styles.symptomsGrid}>
            {SYMPTOMS.map(s => (
              <SymptomSlider key={s.id} label={s.label}
                value={symptoms[s.id] ?? 0}
                onChange={v => setSymptoms(p => ({ ...p, [s.id]: v }))}
              />
            ))}
          </div>
        </div>

        {/* 6. K-BILD */}
        <div className={dStyles.card}>
          <div className={styles.kbildHeader}>
            <div>
              <p className={dStyles.cardTitle}>Quality of Life — K-BILD Questionnaire</p>
              <p className={dStyles.cardSub}>King&apos;s Brief Interstitial Lung Disease questionnaire · 15 questions</p>
            </div>
            {kbildScore !== null && (
              <div className={styles.kbildScore}>
                <span className={styles.kbildScoreVal}>{kbildScore}</span>
                <span className={styles.kbildScoreLbl}>/ 100</span>
              </div>
            )}
          </div>

          <div className={styles.kbildProgress}>
            <div className={styles.kbildProgressFill} style={{ width: `${(answeredCount / 15) * 100}%` }} />
          </div>
          <p className={styles.kbildProgressLbl}>{answeredCount}/15 answered</p>

          <div className={styles.kbildQuestions}>
            {KBILD_QUESTIONS.map((q, i) => (
              <div key={i} className={styles.kbildQ}>
                <p className={styles.kbildQText}>
                  <span className={styles.kbildQNum}>Q{i + 1}.</span> {q}
                </p>
                <ScaleSelector
                  value={kbild[i + 1] ?? null}
                  onChange={v => setKbildQ(i + 1, v)}
                  scale={i === 14 ? Q15_SCALE : KBILD_SCALE}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Submit */}
        <SubmitBtn canSubmit={canSubmit} onSubmit={() => setSubmitted(true)} label="Submit Daily Log →" />
      </div>
    </div>
  );
}
