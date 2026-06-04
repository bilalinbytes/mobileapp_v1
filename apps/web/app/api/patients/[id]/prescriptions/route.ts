import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/server/supabase-admin";

export const dynamic = "force-dynamic";

const PATIENT_INSTRUCTION_WORD_LIMIT = 50;

function wordCount(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

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

// ── GET /api/patients/[id]/prescriptions ──────────────────────────────────────
// Returns all medications grouped by prescription date (start_date),
// sorted newest first. Each group = one consultation's prescription.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: patientId } = await params;
  const supabase = await createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!(await canAccessPatient(patientId, user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: meds, error } = await admin
    .from("medications")
    .select("id, drug_name, dose, dose_unit, route, frequency, start_date, end_date, serial_number")
    .eq("patient_id", patientId)
    .order("start_date", { ascending: false })
    .order("serial_number", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Group by start_date (prescription date)
  const grouped: Record<string, typeof meds> = {};
  for (const med of meds ?? []) {
    const key = med.start_date;
    if (!grouped[key]) grouped[key] = [];
    grouped[key]!.push(med);
  }

  // Return as sorted array of { date, medications[] }
  const prescriptions = Object.entries(grouped)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, medications]) => ({ date, medications }));

  return NextResponse.json({ prescriptions });
}

// ── POST /api/patients/[id]/prescriptions ─────────────────────────────────────
// Saves a new prescription (batch of medications) for today's date.
// Each drug in the batch gets start_date = today.
// Optionally marks previous drugs as ended (end_date = yesterday) if replaced.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: patientId } = await params;
  const supabase = await createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!(await canAccessPatient(patientId, user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const admin = createAdminClient();

  let body: {
    prescription_date: string;
    notes?: string;
    patient_instruction?: string;
    medications: Array<{
      drug_name: string;
      route: string;
      dose: number | null;
      dose_unit: string | null;
      frequency: string | null;
      end_date: string | null;
      status: "continue" | "modified" | "new" | "stopped";
    }>;
    stopped_medication_ids?: string[];
  };

  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { prescription_date, medications, stopped_medication_ids } = body;
  const patientInstruction = body.patient_instruction?.trim() ?? "";

  if (!prescription_date || !medications?.length) {
    return NextResponse.json({ error: "prescription_date and medications are required" }, { status: 400 });
  }

  if (patientInstruction && wordCount(patientInstruction) > PATIENT_INSTRUCTION_WORD_LIMIT) {
    return NextResponse.json({ error: "Patient instructions must be 50 words or fewer" }, { status: 400 });
  }

  // Mark stopped medications as ended
  if (stopped_medication_ids?.length) {
    const yesterday = new Date(prescription_date);
    yesterday.setDate(yesterday.getDate() - 1);
    const endDate = yesterday.toISOString().split("T")[0]!;

    await admin
      .from("medications")
      .update({ end_date: endDate })
      .in("id", stopped_medication_ids)
      .eq("patient_id", patientId);
  }

  // Insert new/modified medications with today's prescription date
  const inserts = medications
    .filter(m => m.status !== "stopped")
    .map((m, idx) => ({
      patient_id: patientId,
      prescribed_by_doctor_id: user.id,
      drug_name: m.drug_name,
      route: m.route,
      dose: m.dose,
      dose_unit: m.dose_unit,
      frequency: m.frequency,
      start_date: prescription_date,
      end_date: m.end_date ?? null,
      serial_number: idx + 1,
    }));

  if (inserts.length > 0) {
    const { error: insertError } = await admin.from("medications").insert(inserts);
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
  }

  if (patientInstruction) {
    const { error: instructionError } = await admin
      .from("doctor_instructions")
      .insert({
        patient_id: patientId,
        doctor_id: user.id,
        instruction_text: patientInstruction,
      });

    if (instructionError) {
      return NextResponse.json({ error: instructionError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, saved: inserts.length });
}
