"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export interface PatientHomeData {
  loading: boolean;
  spo2Today: number;
  mmrcToday: number;
  aqiToday: number;
  riskScore: number;
  doctor: string;
  doctorHospital: string;
  spo2Trend: number[];
  mmrcTrend: number[];
  vasTrend: number[];
  diseaseSpecificTrend: number[];
  lastLogDate: string | null;
  diagnosis: string | null;
  baselineSpo2: number | null;
  baselineHeartRate: number | null;
  latestPft: {
    fev1_fvc_ratio: number | null;
    fev1: number | null;
    fvc: number | null;
    dlco: number | null;
    test_date: string | null;
  } | null;
}

const FALLBACKS = {
  spo2Today: 94,
  mmrcToday: 1,
  aqiToday: 85,
  riskScore: 4,
  doctor: "Assigned doctor",
  doctorHospital: "",
};

export function usePatientHomeData(
  patientId: string | null,
  doctorId: string | null,
  effectiveDashboard: string | null,
  refreshKey = 0,
): PatientHomeData {
  const [data, setData] = useState<PatientHomeData>({
    loading: true,
    ...FALLBACKS,
    spo2Trend: [],
    mmrcTrend: [],
    vasTrend: [],
    diseaseSpecificTrend: [],
    lastLogDate: null,
    diagnosis: null,
    baselineSpo2: null,
    baselineHeartRate: null,
    latestPft: null,
  });

  useEffect(() => {
    if (!patientId) return;

    (async () => {
      const supabase = createClient();
      const doctorQuery = doctorId
        ? fetch("/api/patient-doctor")
            .then((response) => (response.ok ? response.json() : null))
            .catch(() => null)
        : Promise.resolve(null);

      const [logsRes, scoreRes, doctorPayload, diagnosisRes, baselineRes, pftRes] = await Promise.all([
        supabase
          .from("daily_logs")
          .select("logged_at, spo2_rest, mmrc_today, aqi_value, vas_symptoms, disease_specific_data")
          .eq("patient_id", patientId)
          .order("logged_at", { ascending: false })
          .limit(14),
        supabase
          .from("red_flag_scores")
          .select("global_score")
          .eq("patient_id", patientId)
          .order("computed_at", { ascending: false })
          .limit(1)
          .single(),
        doctorQuery,
        supabase
          .from("patient_diagnoses")
          .select("primary_diagnosis, effective_dashboard")
          .eq("patient_id", patientId)
          .order("created_at", { ascending: false })
          .limit(1)
          .single(),
        supabase
          .from("patient_baselines")
          .select("baseline_spo2")
          .eq("patient_id", patientId)
          .maybeSingle(),
        supabase
          .from("pft_records")
          .select("test_date, fev1_fvc_ratio, fev1, fvc, dlco")
          .eq("patient_id", patientId)
          .order("test_date", { ascending: false })
          .limit(1)
          .single(),
      ]);

      const doctor = doctorPayload?.doctor as
        | { name?: string | null; hospital?: string | null }
        | null
        | undefined;

      // reverse so index 0 = oldest, index 13 = most recent (sparkline order)
      const logs = (logsRes.data ?? []).slice().reverse();
      const latestLog = logs.length > 0 ? logs[logs.length - 1] : null;

      const spo2Trend = logs.map(l => l.spo2_rest ?? FALLBACKS.spo2Today);
      const mmrcTrend = logs.map(l => l.mmrc_today ?? 0);
      const vasTrend = logs.map(l => {
        const vas = l.vas_symptoms as Record<string, number> | null;
        if (!vas) return 0;
        const vals = Object.values(vas).filter(v => typeof v === "number");
        return vals.length > 0 ? Math.max(...vals) : 0;
      });

      const diseaseSpecificTrend = logs.map(l => {
        const d = l.disease_specific_data as Record<string, unknown>;
        if (effectiveDashboard === "asthma") {
          return typeof d?.rescue_inhaler_puffs === "number" ? d.rescue_inhaler_puffs : 0;
        }
        if (effectiveDashboard === "copd" || effectiveDashboard === "post_icu") {
          return typeof d?.energy_level === "number" ? d.energy_level : 5;
        }
        if (effectiveDashboard === "ild") {
          return typeof d?.kbild_score === "number" ? d.kbild_score : 0;
        }
        return 0;
      });

      setData({
        loading: false,
        spo2Today: latestLog?.spo2_rest ?? FALLBACKS.spo2Today,
        mmrcToday: latestLog?.mmrc_today ?? FALLBACKS.mmrcToday,
        aqiToday: latestLog?.aqi_value ?? FALLBACKS.aqiToday,
        riskScore: scoreRes.data?.global_score ?? FALLBACKS.riskScore,
        doctor: doctor?.name ?? FALLBACKS.doctor,
        doctorHospital: doctor?.hospital ?? FALLBACKS.doctorHospital,
        spo2Trend: spo2Trend.length > 0 ? spo2Trend : [],
        mmrcTrend: mmrcTrend.length > 0 ? mmrcTrend : [],
        vasTrend: vasTrend.length > 0 ? vasTrend : [],
        diseaseSpecificTrend: diseaseSpecificTrend.length > 0 ? diseaseSpecificTrend : [],
        lastLogDate: latestLog?.logged_at ?? null,
        diagnosis: diagnosisRes.data?.primary_diagnosis ?? null,
        baselineSpo2: baselineRes.data?.baseline_spo2 ?? null,
        baselineHeartRate: null,
        latestPft: pftRes.data
          ? {
              fev1_fvc_ratio: pftRes.data.fev1_fvc_ratio,
              fev1: pftRes.data.fev1,
              fvc: pftRes.data.fvc,
              dlco: pftRes.data.dlco,
              test_date: pftRes.data.test_date,
            }
          : null,
      });
    })();
  }, [patientId, doctorId, effectiveDashboard, refreshKey]);

  return data;
}
