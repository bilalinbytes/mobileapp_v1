import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  computeRedFlagScore,
  runAlertEngine,
  type DailyLogInput,
  type PatientBaseline,
} from "@saans/scoring-engine";

// POST /api/logs — doctor-side log submission (legacy endpoint)
export async function POST(request: Request): Promise<NextResponse> {
  const supabase = await createClient();

  // Auth check
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  // Parse body
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const patientId = body.patientId as string | undefined;
  if (!patientId) {
    return NextResponse.json({ error: "patientId is required" }, { status: 400 });
  }

  const logData = body.log as Record<string, unknown> | undefined;
  if (!logData) {
    return NextResponse.json({ error: "log data is required" }, { status: 400 });
  }

  const loggedAt = (logData.logged_at as string | undefined) ?? new Date().toISOString();

  // 1. Insert daily_log
  const { data: insertedLog, error: logError } = await supabase
    .from("daily_logs")
    .insert({
      patient_id: patientId,
      logged_at: loggedAt,
      spo2_rest: (logData.spo2_rest as number | null) ?? null,
      spo2_exertion: (logData.spo2_exertion as number | null) ?? null,
      mmrc_today: (logData.mmrc_today as number | null) ?? null,
      aqi_value: (logData.aqi_value as number | null) ?? null,
      medication_compliance: (logData.medication_compliance as import("@/lib/database.types").Json | null) ?? null,
      vas_symptoms: (logData.vas_symptoms as import("@/lib/database.types").Json | null) ?? null,
      disease_specific_data: (logData.disease_specific_data as import("@/lib/database.types").Json) ?? {},
      step_count_today: (logData.step_count_today as number | null) ?? null,
    })
    .select("id")
    .single();

  if (logError || !insertedLog) {
    console.error("daily_logs insert error:", logError);
    return NextResponse.json({ error: "Failed to save log" }, { status: 500 });
  }

  const logId = insertedLog.id;

  // 2. Fetch patient diagnosis for effective_dashboard
  const { data: diagRow } = await supabase
    .from("patient_diagnoses")
    .select("effective_dashboard, primary_diagnosis")
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  const effectiveDashboard = (diagRow?.effective_dashboard ?? "ild") as PatientBaseline["effective_dashboard"];

  // 3. Fetch patient baseline
  const { data: baselineRow } = await supabase
    .from("patient_baselines")
    .select("baseline_spo2, baseline_mmrc, baseline_oxygen_flow")
    .eq("patient_id", patientId)
    .single();

  // 4. Fetch recent logs for consecutive-day rules
  const { data: recentLogs } = await supabase
    .from("daily_logs")
    .select("logged_at, spo2_rest, spo2_exertion, mmrc_today, disease_specific_data")
    .eq("patient_id", patientId)
    .order("logged_at", { ascending: false })
    .limit(3);

  // 5. Build scoring input
  const logInput: DailyLogInput = {
    patient_id: patientId,
    log_date: loggedAt.split("T")[0] ?? loggedAt,
    spo2_rest: (logData.spo2_rest as number | null) ?? null,
    spo2_exertion: (logData.spo2_exertion as number | null) ?? null,
    mmrc_today: (logData.mmrc_today as number | null) ?? null,
    aqi_value: (logData.aqi_value as number | null) ?? null,
    medication_compliance: (logData.medication_compliance as Record<string, boolean> | null) ?? null,
    vas_symptoms: (logData.vas_symptoms as Partial<Record<"breathlessness" | "cough" | "wheeze" | "fatigue" | "chest_pain" | "chest_heaviness", number>> | null) ?? null,
    disease_specific_data: (logData.disease_specific_data as Record<string, unknown>) ?? {},
    temperature_f: (logData.temperature_f as number | null) ?? null,
    haemoptysis: (logData.haemoptysis as boolean | null) ?? null,
    heart_rate: (logData.heart_rate as number | null) ?? null,
    respiratory_rate: (logData.respiratory_rate as number | null) ?? null,
    pedal_oedema: (logData.pedal_edema as boolean | null) ?? null,
    oxygen_requirement_litres: (logData.oxygen_requirement_litres as number | null) ?? null,
    step_count_today: (logData.step_count_today as number | null) ?? null,
  };

  const baseline: PatientBaseline = {
    baseline_spo2: baselineRow?.baseline_spo2 ?? null,
    baseline_mmrc: baselineRow?.baseline_mmrc ?? null,
    baseline_oxygen_litres: baselineRow?.baseline_oxygen_flow ?? null,
    primary_diagnosis: effectiveDashboard as PatientBaseline["primary_diagnosis"],
    effective_dashboard: effectiveDashboard,
  };

  const previousLogs = (recentLogs ?? []).map((r) => ({
    patient_id: patientId,
    log_date: r.logged_at,
    spo2_rest: r.spo2_rest,
    spo2_exertion: r.spo2_exertion,
    mmrc_today: r.mmrc_today,
    aqi_value: null,
    medication_compliance: null,
    vas_symptoms: null,
    disease_specific_data: (r.disease_specific_data as Record<string, unknown>) ?? {},
    temperature_f: null,
    haemoptysis: null,
    heart_rate: null,
    respiratory_rate: null,
    pedal_oedema: null,
    oxygen_requirement_litres: null,
  }));

  // 6. Run scoring engine
  let scoreResult;
  let alertResult;
  try {
    scoreResult = computeRedFlagScore(logInput, baseline);
    alertResult = runAlertEngine(logInput, previousLogs, baseline);
  } catch (e) {
    console.error("Scoring engine error:", e);
    return NextResponse.json({ ok: true, logId, warning: "Scoring engine failed" });
  }

  // 7. Insert red_flag_score using admin client (service role)
  const { data: scoreRow, error: scoreError } = await supabaseAdmin
    .from("red_flag_scores")
    .insert({
      patient_id: patientId,
      log_id: logId,
      global_score: scoreResult.global_score,
      risk_level: scoreResult.risk_level,
      indicator_color: scoreResult.indicator_color,
      score_breakdown: scoreResult.score_breakdown as unknown as import("@/lib/database.types").Json,
    })
    .select("id")
    .single();

  if (scoreError) {
    console.error("red_flag_scores insert error:", scoreError);
    // Non-fatal — continue
  }

  // 8. Insert disease_alert if RED or ORANGE
  if (alertResult.alert_type === "red" || alertResult.alert_type === "yellow") {
    const { error: alertError } = await supabaseAdmin
      .from("disease_alerts")
      .insert({
        patient_id: patientId,
        log_id: logId,
        score_id: scoreRow?.id ?? null,
        alert_type: alertResult.alert_type.toUpperCase(),
        reason_text: alertResult.reason_text,
        triggering_metrics: alertResult.triggering_metrics as unknown as import("@/lib/database.types").Json,
      });

    if (alertError) {
      console.error("disease_alerts insert error:", alertError);
      // Non-fatal — continue
    }
  }

  return NextResponse.json({
    ok: true,
    logId,
    score: scoreResult.global_score,
    alertLevel: alertResult.alert_type,
  });
}
