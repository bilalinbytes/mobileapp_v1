import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/server/supabase-admin";
import type { Database } from "@/lib/database.types";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return NextResponse.json({ error: "Missing auth token" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: sessionData, error: authError } = await admin.auth.getUser(token);
  if (authError || !sessionData.user) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  let body: { message?: string };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const message = body.message?.trim() ?? "";
  if (!message) {
    return NextResponse.json({ error: "Emergency message is required" }, { status: 400 });
  }

  if (message.length > 500) {
    return NextResponse.json({ error: "Emergency message must be 500 characters or fewer" }, { status: 400 });
  }

  const patientId = sessionData.user.id;
  const { data: patient } = await admin
    .from("patients")
    .select("id")
    .eq("id", patientId)
    .maybeSingle();

  if (!patient) {
    return NextResponse.json({ error: "Patient not found" }, { status: 404 });
  }

  const { error } = await admin.from("disease_alerts").insert({
    patient_id: patientId,
    alert_type: "RED",
    reason_text: `Patient emergency message after daily logs finished: ${message}`,
    triggering_metrics: { emergency_message: message } as unknown as Database["public"]["Tables"]["disease_alerts"]["Insert"]["triggering_metrics"],
    acknowledged_by_doctor: false,
    is_suppressed: false,
  } as unknown as Database["public"]["Tables"]["disease_alerts"]["Insert"]);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
