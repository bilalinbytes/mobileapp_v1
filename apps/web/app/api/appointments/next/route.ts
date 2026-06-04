import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/server/supabase-admin";
import type { Database } from "@/lib/database.types";

type AppointmentRow = Database["public"]["Tables"]["appointments"]["Row"];

// GET /api/appointments/next
// Patient-facing: Bearer token auth, returns their next upcoming appointment.
export async function GET(request: Request): Promise<NextResponse> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Missing authorization header" }, { status: 401 });
  }

  const token = authHeader.slice(7);
  const admin = createAdminClient();

  const { data: sessionData, error: authError } = await admin.auth.getUser(token);
  if (authError || !sessionData.user) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const patientId = sessionData.user.id;

  const { data, error } = await admin
    .from("appointments")
    .select("*")
    .eq("patient_id", patientId)
    .in("status", ["upcoming", "approved", "patient_accepted"])
    .gte("scheduled_at", new Date().toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ appointment: data as AppointmentRow | null });
}
