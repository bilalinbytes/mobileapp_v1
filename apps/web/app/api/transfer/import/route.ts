import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/server/supabase-admin";
import { hashOtp } from "@/lib/server/patient-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  // Cookie-based auth — caller must be a doctor
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminClient = createAdminClient();

  const { data: doctor } = await adminClient
    .from("doctors")
    .select("id, name, hospital")
    .eq("id", user.id)
    .single();
  if (!doctor) {
    return NextResponse.json({ error: "Forbidden — not a doctor" }, { status: 403 });
  }

  const body = await request.json() as { patient_mobile?: string; code?: string };
  const { patient_mobile, code } = body;

  if (!patient_mobile || !code) {
    return NextResponse.json({ error: "patient_mobile and code are required" }, { status: 400 });
  }
  if (!/^\d{6}$/.test(code)) {
    return NextResponse.json({ error: "Code must be exactly 6 digits" }, { status: 400 });
  }

  // Normalise the mobile number the same way the enrolment schema does
  const digits = patient_mobile.replace(/\D/g, "").slice(-10);
  const normalizedMobile = `+91${digits}`;

  const { data: patientRow } = await adminClient
    .from("patients")
    .select("id, name, date_of_birth, gender, mobile_number, doctor_id")
    .eq("mobile_number", normalizedMobile)
    .single();

  if (!patientRow) {
    return NextResponse.json({ error: "No patient found with that mobile number" }, { status: 404 });
  }
  if (patientRow.doctor_id === doctor.id) {
    return NextResponse.json({ error: "Patient is already under your care" }, { status: 409 });
  }

  const { data: codeEntries } = await adminClient
    .from("audit_logs")
    .select("*")
    .eq("action", "patient_import_otp_sent")
    .eq("target_patient_id", patientRow.id)
    .eq("actor_id", doctor.id)
    .order("created_at", { ascending: false })
    .limit(5);

  type CodeMeta = { otp_hash: string; expires_at: string; used: boolean; attempts?: number };
  const inputHash = hashOtp(code);

  const validEntry = codeEntries?.find((entry) => {
    const meta = entry.metadata as CodeMeta | null;
    return (
      meta?.otp_hash === inputHash &&
      !meta?.used &&
      new Date(meta.expires_at) > new Date()
    );
  });

  if (!validEntry) {
    const latest = codeEntries?.[0];
    const latestMeta = latest?.metadata as CodeMeta | null;
    if (latest && latestMeta && !latestMeta.used) {
      await adminClient
        .from("audit_logs")
        .update({ metadata: { ...latestMeta, attempts: (latestMeta.attempts ?? 0) + 1 } })
        .eq("id", latest.id);
    }
    return NextResponse.json(
      { error: "Invalid or expired OTP. Send a new OTP if the patient did not receive it." },
      { status: 400 }
    );
  }

  const validMeta = validEntry.metadata as CodeMeta | null;

  // Mark code as used so it cannot be replayed
  await adminClient
    .from("audit_logs")
    .update({ metadata: { ...validMeta, used: true, used_at: new Date().toISOString() } })
    .eq("id", validEntry.id);

  // Capture the previous doctor's name for the success screen
  let lastDoctor: string | undefined;
  if (patientRow.doctor_id) {
    const { data: prevDoctor } = await adminClient
      .from("doctors")
      .select("name, hospital")
      .eq("id", patientRow.doctor_id)
      .single();
    if (prevDoctor) {
      lastDoctor = `Dr. ${prevDoctor.name}, ${prevDoctor.hospital}`;
    }
  }

  // Grant access without removing the patient from previous doctors.
  await adminClient.from("audit_logs").insert({
    action: "patient_access_granted",
    actor_id: doctor.id,
    actor_role: "doctor",
    target_patient_id: patientRow.id,
    metadata: {
      granted_by: "patient_otp",
      patient_mobile: normalizedMobile,
      previous_primary_doctor_id: patientRow.doctor_id,
      granted_at: new Date().toISOString(),
    },
  });

  // Fetch diagnosis for the success screen
  const { data: diagnosis } = await adminClient
    .from("patient_diagnoses")
    .select("primary_diagnosis, post_icu_sub_diagnosis")
    .eq("patient_id", patientRow.id)
    .single();

  const age = patientRow.date_of_birth
    ? Math.floor((Date.now() - new Date(patientRow.date_of_birth).getTime()) / 3.156e10)
    : 0;

  const primaryCategory = (diagnosis?.primary_diagnosis ?? "Unknown").toUpperCase();
  const subtype = diagnosis?.post_icu_sub_diagnosis?.toUpperCase() ?? undefined;
  const condition = subtype
    ? `${primaryCategory} · Post-ICU (${subtype})`
    : primaryCategory;

  return NextResponse.json({
    success: true,
    patientData: {
      id: patientRow.id,
      fullName: patientRow.name,
      age,
      sex: (patientRow.gender as "Male" | "Female" | "Other") ?? "Other",
      mobileNumber: patient_mobile,
      emailId: "",
      diagnosis: { primaryCategory, subtype },
      condition,
      lastDoctor,
    },
  });
}
