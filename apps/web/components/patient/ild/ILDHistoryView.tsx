"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2 } from "lucide-react";
import dStyles from "@/components/patient/disease.module.css";
import styles from "./ILD.module.css";
import "@/lib/i18n";

type JsonRecord = Record<string, unknown>;

interface ILDHistoryLog {
  logged_at: string;
  spo2_rest: number | null;
  spo2_exertion: number | null;
  mmrc_today: number | null;
  vas_symptoms: JsonRecord | null;
  disease_specific_data: JsonRecord | null;
  side_effects: unknown[] | null;
}

function numericField(record: JsonRecord | null | undefined, key: string): number | null {
  const value = record?.[key];
  return typeof value === "number" ? value : null;
}

// Helper for formatting dates
function formatDayLabel(dateString: string) {
  const d = new Date(dateString);
  const day = d.getDate();
  const dayOfWeek = ["S", "M", "T", "W", "T", "F", "S"][d.getDay()];
  return `${day}${dayOfWeek}`;
}

function Sparkline({ points, color }: { points: number[]; color: string }) {
  const W = 300, H = 40;
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

export function ILDHistoryView({ patientId }: { patientId: string }) {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<ILDHistoryLog[]>([]);
  const [trendData, setTrendData] = useState<{
    spo2Rest: number[];
    spo2Ex: number[];
    mmrc: number[];
    kbild: number[];
    labels: string[];
  }>({ spo2Rest: [], spo2Ex: [], mmrc: [], kbild: [], labels: [] });

  useEffect(() => {
    async function fetchLogs() {
      setLoading(true);
      const fourteenDaysAgo = new Date();
      fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

      const { data, error } = await supabase
        .from("daily_logs")
        .select("logged_at, spo2_rest, spo2_exertion, mmrc_today, vas_symptoms, disease_specific_data, side_effects")
        .eq("patient_id", patientId)
        .gte("logged_at", fourteenDaysAgo.toISOString().split("T")[0])
        .order("logged_at", { ascending: false });

      if (data && !error) {
        const typedData = data as ILDHistoryLog[];
        setLogs(typedData);
        
        const ascendingData = [...typedData].reverse();
        
        const spo2Rest = ascendingData.map(d => d.spo2_rest || 0);
        const spo2Ex = ascendingData.map(d => d.spo2_exertion || 0);
        const mmrc = ascendingData.map(d => d.mmrc_today || 0);
        const kbild = ascendingData.map(d => {
          return numericField(d.disease_specific_data, "kbild_score") ?? 0;
        });
        const labels = ascendingData.map(d => formatDayLabel(d.logged_at));
        
        setTrendData({ spo2Rest, spo2Ex, mmrc, kbild, labels });
      }
      setLoading(false);
    }
    fetchLogs();
  }, [patientId, supabase]);

  if (loading) {
    return (
      <div className={dStyles.view} style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "50vh" }}>
        <Loader2 className="animate-spin" size={32} color="#4527a0" />
      </div>
    );
  }

  return (
    <div className={dStyles.view}>
      <div className={dStyles.pageHeader}>
        <div>
          <h1 className={dStyles.pageTitle}>History</h1>
          <p className={dStyles.pageSub}>Past submitted entries · Last 14 days</p>
        </div>
      </div>

      <div className={dStyles.body}>
        {/* Charts Grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 20 }}>
          {[
            { label: "SpO₂ Rest", points: trendData.spo2Rest, color: "#7c4dff", unit: "%" },
            { label: "SpO₂ Exertion", points: trendData.spo2Ex, color: "#9575cd", unit: "%" },
            { label: "mMRC", points: trendData.mmrc, color: "#e24b4a", unit: "" },
            { label: "K-BILD Score", points: trendData.kbild, color: "#4527a0", unit: "" },
          ].map(chart => (
            <div key={chart.label} style={{ background: "white", padding: 14, borderRadius: 16, boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: "#666" }}>{chart.label}</p>
                <span style={{ fontSize: 12, fontWeight: 700, color: chart.color }}>{chart.points[chart.points.length-1] ?? 0}{chart.unit}</span>
              </div>
              <div style={{ height: 40 }}>
                {chart.points.length > 0 ? (
                  <Sparkline points={chart.points} color={chart.color} />
                ) : (
                  <div style={{ height: 40, display: "flex", alignItems: "center", justifyContent: "center", color: "#999", fontSize: 11 }}>No data</div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Logs List */}
        {logs.length === 0 ? (
          <p style={{ textAlign: "center", color: "#888", padding: 40 }}>No logs found. · कोई लॉग नहीं मिला।</p>
        ) : (
          logs.map((entry) => {
            const kbildVal = numericField(entry.disease_specific_data, "kbild_score") ?? 0;
            const symptoms = entry.vas_symptoms || {};
            const se = Array.isArray(entry.side_effects) ? entry.side_effects : [];

            return (
              <div key={entry.logged_at} className={dStyles.card} style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: "#1a1a18", fontFamily: "var(--font-lora)" }}>
                    {new Date(entry.logged_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                  <div className={styles.kbildBadge} style={{ padding: "6px 12px" }}>
                    <span className={styles.kbildBadgeVal} style={{ fontSize: 18 }}>{kbildVal}</span>
                    <span className={styles.kbildBadgeLbl}>K-BILD</span>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0, marginBottom: 14 }}>
                  {[
                    { label: "SpO₂ Rest", val: entry.spo2_rest === null ? "-" : `${entry.spo2_rest}%`, warn: entry.spo2_rest !== null && entry.spo2_rest < 90 },
                    { label: "SpO₂ Ex", val: entry.spo2_exertion === null ? "-" : `${entry.spo2_exertion}%`, warn: entry.spo2_exertion !== null && entry.spo2_exertion < 88 },
                    { label: "mMRC", val: entry.mmrc_today === null ? "-" : String(entry.mmrc_today), warn: entry.mmrc_today !== null && entry.mmrc_today >= 3 },
                    { label: "K-BILD", val: String(kbildVal), warn: kbildVal < 50 },
                  ].map(v => (
                    <div key={v.label} style={{ textAlign: "center", padding: "10px 8px", borderRight: "1px solid rgba(0,0,0,0.06)" }}>
                      <p style={{ fontSize: 18, fontWeight: 700, color: v.warn ? "#e24b4a" : "#1a1a18", fontFamily: "var(--font-lora)" }}>{v.val}</p>
                      <p style={{ fontSize: 10, color: "#888680", marginTop: 2, fontFamily: "var(--font-dm-sans)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{v.label}</p>
                    </div>
                  ))}
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: se.length > 0 ? 10 : 0 }}>
                  {Object.entries(symptoms).filter(([, v]) => (v as number) > 0).map(([k, v]) => (
                    <span key={k} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 8, background: (v as number) >= 7 ? "#fcebeb" : (v as number) >= 4 ? "#fef9e7" : "#f5f3ee", color: (v as number) >= 7 ? "#e24b4a" : (v as number) >= 4 ? "#ef9f27" : "#4a4a46", fontFamily: "var(--font-dm-sans)", fontWeight: 500 }}>
                      {k.replace("_", " ")}: {v as number}/10
                    </span>
                  ))}
                </div>

                {se.length > 0 && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {se.map((sideEffect) => (
                      <span key={String(sideEffect)} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 8, background: "#fdf5f5", color: "#e24b4a", fontFamily: "var(--font-dm-sans)", fontWeight: 500 }}>
                        {String(sideEffect)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
