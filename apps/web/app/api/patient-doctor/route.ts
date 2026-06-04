import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/server/supabase-admin";

export async function GET(): Promise<NextResponse> {
  const supabase = await createServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: patient, error: patientError } = await admin
    .from("patients")
    .select("id, doctor_id")
    .eq("id", user.id)
    .maybeSingle();

  if (patientError) {
    return NextResponse.json(
      { error: "Failed to load patient." },
      { status: 500 },
    );
  }

  if (!patient) {
    return NextResponse.json({ error: "Patient not found." }, { status: 404 });
  }

  if (!patient.doctor_id) {
    return NextResponse.json({ doctor: null }, { status: 200 });
  }

  const { data: doctor, error: doctorError } = await admin
    .from("doctors")
    .select("id, name, hospital, specialisation")
    .eq("id", patient.doctor_id)
    .maybeSingle();

  if (doctorError) {
    return NextResponse.json(
      { error: "Failed to load doctor." },
      { status: 500 },
    );
  }

  return NextResponse.json({ doctor: doctor ?? null }, { status: 200 });
}
