"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2 } from "lucide-react";
import styles from "./HistoryView.module.css";
import { useTranslation } from "react-i18next";
import { usePatient } from "@/contexts/PatientContext";
import "@/lib/i18n";

type JsonRecord = Record<string, unknown>;

interface HistoryLog {
  logged_at: string;
  spo2_rest: number | null;
  spo2_exertion: number | null;
  mmrc_today: number | null;
  vas_symptoms: JsonRecord | null;
  aqi_value: number | null;
  medication_compliance: Record<string, boolean> | null;
  side_effects: unknown[] | null;
  disease_specific_data: JsonRecord | null;
}

function numericField(record: JsonRecord | null | undefined, key: string): number | null {
  const value = record?.[key];
  return typeof value === "number" ? value : null;
}

// Helper for formatting dates to match the 14-day trend array
function formatDayLabel(dateString: string) {
  const d = new Date(dateString);
  const day = d.getDate();
  const dayOfWeek = ["S", "M", "T", "W", "T", "F", "S"][d.getDay()];
  return `${day}${dayOfWeek}`;
}

// Sparkline component remains unchanged
function Sparkline({ points, color }: { points: number[]; color: string }) {
  const W = 300, H = 40;
  // if no points or all same, handle gracefully
  let min = Math.min(...points);
  let max = Math.max(...points);
  if (points.length === 0) { min = 0; max = 1; }
  if (min === max) { min -= 1; max += 1; }
  
  const range = max - min;
  const coords = points.map((v, i) => {
    const x = points.length > 1 ? (i / (points.length - 1)) * W : W / 2;
    const y = H - ((v - min) / range) * (H - 6) - 3;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <polyline points={coords} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export function HistoryView({ patientId }: { patientId: string }) {
  const { t } = useTranslation("patient");
  const { patient } = usePatient();
  const effective_dashboard = patient?.effective_dashboard;
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<HistoryLog[]>([]);
  const [trendData, setTrendData] = useState<{
    spo2: number[];
    mmrc: number[];
    vas: number[];
    energy: number[];
    labels: string[];
  }>({ spo2: [], mmrc: [], vas: [], energy: [], labels: [] });

  useEffect(() => {
    async function fetchLogs() {
      setLoading(true);
      const fourteenDaysAgo = new Date();
      fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

      const { data, error } = await supabase
        .from("daily_logs")
        .select("logged_at, spo2_rest, spo2_exertion, mmrc_today, vas_symptoms, aqi_value, medication_compliance, side_effects, disease_specific_data")
        .eq("patient_id", patientId)
        .gte("logged_at", fourteenDaysAgo.toISOString().split("T")[0])
        .order("logged_at", { ascending: false });

      if (data && !error) {
        const typedData = data as HistoryLog[];
        setLogs(typedData);
        
        // Prepare trend data (ascending order for charts)
        const ascendingData = [...typedData].reverse();
        
        const spo2 = ascendingData.map(d => d.spo2_rest || 0);
        const mmrc = ascendingData.map(d => d.mmrc_today || 0);
        const vas = ascendingData.map(d => {
          return numericField(d.vas_symptoms, "breathlessness") ?? 0;
        });
        const energy = ascendingData.map(d => {
          return numericField(d.disease_specific_data, "energy_level") ?? 0;
        });
        const labels = ascendingData.map(d => formatDayLabel(d.logged_at));
        
        setTrendData({ spo2, mmrc, vas, energy, labels });
      }
      setLoading(false);
    }
    fetchLogs();
  }, [patientId, supabase]);

  if (loading) {
    return (
      <div className={styles.view} style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "50vh" }}>
        <Loader2 className="animate-spin" size={32} color="#1565c0" />
      </div>
    );
  }

  return (
    <div className={styles.view}>
      <div className={styles.header}>
        <h1 className={styles.title}>
          {t("log.history.title", "Health History")}
          <span className={styles.titleHi} style={{ display: "block", fontSize: "14px", fontWeight: "normal", color: "#666" }}>स्वास्थ्य इतिहास</span>
        </h1>
        <p className={styles.sub}>
          {t("log.history.last14", "Last 14 days")} · {t("log.history.allData", "All your logged data")}
          <span style={{ display: "block", opacity: 0.8 }}>पिछले 14 दिन · आपका सभी डेटा</span>
        </p>
      </div>

      <div className={styles.body}>
        {/* Trend charts */}
        <div className={styles.chartsGrid}>
          {[
            { label: "SpO₂ at Rest · आराम के समय ऑक्सीजन", points: trendData.spo2, color: "#e24b4a", unit: "%", min: Math.min(...(trendData.spo2.length ? trendData.spo2 : [0])), max: Math.max(...(trendData.spo2.length ? trendData.spo2 : [0])) },
            { label: "Breathlessness (mMRC) · सांस फूलने का स्तर", points: trendData.mmrc, color: "#d85a30", unit: "", min: Math.min(...(trendData.mmrc.length ? trendData.mmrc : [0])), max: Math.max(...(trendData.mmrc.length ? trendData.mmrc : [0])) },
            effective_dashboard === "post_icu" 
              ? { label: "Energy Level · ऊर्जा का स्तर", points: trendData.energy, color: "#0f6e56", unit: "/10", min: Math.min(...(trendData.energy.length ? trendData.energy : [0])), max: Math.max(...(trendData.energy.length ? trendData.energy : [0])) }
              : { label: "Discomfort Score · बेचैनी स्कोर", points: trendData.vas, color: "#ef9f27", unit: "/10", min: Math.min(...(trendData.vas.length ? trendData.vas : [0])), max: Math.max(...(trendData.vas.length ? trendData.vas : [0])) },
          ].map((chart) => (
            <div key={chart.label} className={styles.chartCard}>
              <div className={styles.chartHeader}>
                <p className={styles.chartTitle}>{chart.label}</p>
                {chart.points.length > 0 && (
                  <span className={styles.chartRange} style={{ color: chart.color }}>
                    {chart.min}{chart.unit} – {chart.max}{chart.unit}
                  </span>
                )}
              </div>
              <div className={styles.sparkWrap}>
                {chart.points.length > 0 ? (
                  <Sparkline points={chart.points} color={chart.color} />
                ) : (
                  <div style={{ height: 40, display: "flex", alignItems: "center", justifyContent: "center", color: "#999", fontSize: 12 }}>No data</div>
                )}
              </div>
              {chart.points.length > 0 && (
                <div className={styles.sparkDates}>
                  {trendData.labels.filter((_, i) => i % 2 === 0).map((d, idx) => (
                    <span key={idx} className={styles.sparkDate}>{d}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Daily logs */}
        <div className={styles.logsCard}>
          <p className={styles.sectionTitle}>Daily Logs · दैनिक लॉग</p>
          {logs.length === 0 ? (
            <p className={styles.noData}>No logs found in the last 14 days. · पिछले 14 दिनों में कोई लॉग नहीं मिला।</p>
          ) : (
            logs.map((log) => {
              // Convert medication_compliance from Record<string, boolean> to list of taken
              const meds = Object.entries((log.medication_compliance || {}) as Record<string, boolean>);
              const medsTaken = meds.filter((entry) => entry[1]).map(([name]) => name);
              const medsMissed = meds.filter((entry) => !entry[1]).map(([name]) => name);

              const dDate = new Date(log.logged_at);
              const formattedDate = dDate.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
              
              const vasScore = numericField(log.vas_symptoms, "breathlessness") ?? "-";

              return (
                <div key={log.logged_at} className={styles.logItem}>
                  <div className={styles.logDate}>{formattedDate}</div>
                  <div className={styles.logVitals}>
                    <div className={styles.logVital}>
                      <span className={`${styles.logVal} ${log.spo2_rest && log.spo2_rest < 90 ? styles.logWarn : ""}`}>{log.spo2_rest || "-"}%</span>
                      <span className={styles.logLbl}>SpO₂</span>
                    </div>
                    <div className={styles.logVital}>
                      <span className={`${styles.logVal} ${log.mmrc_today !== null && log.mmrc_today >= 3 ? styles.logWarn : ""}`}>{log.mmrc_today ?? "-"}</span>
                      <span className={styles.logLbl}>mMRC</span>
                    </div>
                    <div className={styles.logVital}>
                      <span className={`${styles.logVal} ${vasScore !== "-" && vasScore >= 7 ? styles.logWarn : ""}`}>
                        {effective_dashboard === "post_icu" 
                          ? (numericField(log.disease_specific_data, "energy_level") ?? "-")
                          : vasScore}
                      </span>
                      <span className={styles.logLbl}>{effective_dashboard === "post_icu" ? "Energy" : "VAS"}</span>
                    </div>
                    <div className={styles.logVital}>
                      <span className={styles.logVal}>
                        {effective_dashboard === "post_icu"
                          ? (numericField(log.disease_specific_data, "sleep_quality") ?? "-")
                          : (log.aqi_value ?? "-")}
                      </span>
                      <span className={styles.logLbl}>{effective_dashboard === "post_icu" ? "Sleep" : "AQI"}</span>
                    </div>
                  </div>
                  {(medsTaken.length > 0 || medsMissed.length > 0) && (
                    <div className={styles.logMeds}>
                      {medsTaken.map(m => (
                        <span key={m} className={styles.medTaken}>Taken {m}</span>
                      ))}
                      {medsMissed.map(m => (
                        <span key={m} className={styles.medMissed}>Missed {m}</span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
