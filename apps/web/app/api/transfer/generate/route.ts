import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/server/supabase-admin";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const adminClient = createAdminClient();

  // Bearer token auth — caller must be a patient
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "").trim();
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const {
    data: { user },
    error: authError,
  } = await adminClient.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Confirm the caller is a registered patient
  const { data: patient } = await adminClient
    .from("patients")
    .select("id")
    .eq("id", user.id)
    .single();
  if (!patient) {
    return NextResponse.json({ error: "Forbidden — not a patient" }, { status: 403 });
  }

  // Invalidate any previous unused transfer codes for this patient
  const { data: previous } = await adminClient
    .from("audit_logs")
    .select("id")
    .eq("action", "transfer_code_generated")
    .eq("target_patient_id", user.id);

  if (previous && previous.length > 0) {
    await adminClient
      .from("audit_logs")
      .update({ metadata: { used: true } })
      .in("id", previous.map((e) => e.id));
  }

  // Generate a cryptographically random 6-digit code
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  const code = String(array[0]! % 1_000_000).padStart(6, "0");
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  await adminClient.from("audit_logs").insert({
    action: "transfer_code_generated",
    actor_id: user.id,
    actor_role: "patient",
    target_patient_id: user.id,
    metadata: { code, expires_at: expiresAt, used: false },
  });

  return NextResponse.json({ code, expires_at: expiresAt });
}
