import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/server/supabase-admin";

export const dynamic = "force-dynamic";

async function canAccessPatient(patientId: string, doctorId: string) {
  const admin = createAdminClient();
  const { data: patient } = await admin
    .from("patients")
    .select("id, doctor_id")
    .eq("id", patientId)
    .maybeSingle();

  if (!patient) return false;
  if (patient.doctor_id === doctorId) return true;

  const { data: grant } = await admin
    .from("audit_logs")
    .select("id")
    .eq("action", "patient_access_granted")
    .eq("actor_id", doctorId)
    .eq("target_patient_id", patientId)
    .limit(1)
    .maybeSingle();

  return Boolean(grant);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: patientId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!(await canAccessPatient(patientId, user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  const [diagRes, logRes, pftRes, medRes] = await Promise.all([
    admin
      .from("patient_diagnoses")
      .select("primary_diagnosis,effective_dashboard")
      .eq("patient_id", patientId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("daily_logs")
      .select("logged_at,spo2_rest,spo2_exertion,mmrc_today,aqi_value,vas_symptoms,medication_compliance,disease_specific_data")
      .eq("patient_id", patientId)
      .order("logged_at", { ascending: false })
      .limit(180),
    admin
      .from("pft_records")
      .select("id,test_date,fev1,fvc,fev1_fvc_ratio,dlco,other_fields")
      .eq("patient_id", patientId)
      .order("test_date", { ascending: false }),
    admin
      .from("medications")
      .select("id,drug_name,route,dose,dose_unit,start_date,end_date")
      .eq("patient_id", patientId)
      .order("start_date", { ascending: false }),
  ]);

  const error = diagRes.error ?? logRes.error ?? pftRes.error ?? medRes.error;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    diagnosis: diagRes.data ?? null,
    logs: logRes.data ?? [],
    pft: pftRes.data ?? [],
    medications: medRes.data ?? [],
  });
}
