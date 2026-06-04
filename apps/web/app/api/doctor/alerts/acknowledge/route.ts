import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/server/supabase-admin";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const patientId =
    typeof body === "object" &&
    body !== null &&
    "patientId" in body &&
    typeof body.patientId === "string"
      ? body.patientId
      : null;

  if (!patientId) {
    return NextResponse.json({ error: "patientId is required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: doctor } = await admin.from("doctors").select("id").eq("id", user.id).single();
  if (!doctor) {
    return NextResponse.json({ error: "Forbidden - not a doctor" }, { status: 403 });
  }

  const [{ data: ownedPatient }, { data: importedAccess }] = await Promise.all([
    admin
      .from("patients")
      .select("id")
      .eq("id", patientId)
      .eq("doctor_id", user.id)
      .maybeSingle(),
    admin
      .from("audit_logs")
      .select("id")
      .eq("action", "patient_access_granted")
      .eq("actor_id", user.id)
      .eq("target_patient_id", patientId)
      .limit(1)
      .maybeSingle(),
  ]);

  if (!ownedPatient && !importedAccess) {
    return NextResponse.json({ error: "Forbidden - patient not assigned" }, { status: 403 });
  }

  const { data: openAlerts, error: selectError } = await admin
    .from("disease_alerts")
    .select("id")
    .eq("patient_id", patientId)
    .eq("acknowledged_by_doctor", false)
    .eq("is_suppressed", false)
    .in("alert_type", ["RED", "YELLOW"]);

  if (selectError) {
    return NextResponse.json({ error: selectError.message }, { status: 500 });
  }

  const alertIds = (openAlerts ?? []).map((alert) => alert.id);
  if (alertIds.length === 0) {
    return NextResponse.json({ ok: true, acknowledged: 0 });
  }

  const { error: updateError } = await admin
    .from("disease_alerts")
    .update({ acknowledged_by_doctor: true })
    .in("id", alertIds);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, acknowledged: alertIds.length });
}
