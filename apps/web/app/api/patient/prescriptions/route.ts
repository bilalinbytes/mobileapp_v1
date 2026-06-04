import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/server/supabase-admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: patient } = await admin
    .from("patients")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (!patient) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [{ data: meds, error: medsError }, { data: instruction, error: instructionError }] = await Promise.all([
    admin
      .from("medications")
      .select("id, drug_name, dose, dose_unit, route, frequency, start_date, end_date, serial_number, created_at")
      .eq("patient_id", patient.id)
      .order("start_date", { ascending: false })
      .order("serial_number", { ascending: true }),
    admin
      .from("doctor_instructions")
      .select("id, instruction_text, created_at")
      .eq("patient_id", patient.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (medsError) {
    return NextResponse.json({ error: medsError.message }, { status: 500 });
  }

  if (instructionError) {
    return NextResponse.json({ error: instructionError.message }, { status: 500 });
  }

  const grouped: Record<string, typeof meds> = {};
  for (const med of meds ?? []) {
    const key = med.start_date;
    if (!grouped[key]) grouped[key] = [];
    grouped[key]!.push(med);
  }

  const prescriptions = Object.entries(grouped)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, medications]) => {
      const createdAt = (medications ?? [])
        .map((medication) => medication.created_at)
        .filter((value): value is string => Boolean(value))
        .sort()
        .at(-1) ?? null;

      return { date, created_at: createdAt, medications };
    });

  return NextResponse.json({ prescriptions, instruction: instruction ?? null });
}
