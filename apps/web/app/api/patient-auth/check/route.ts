import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/server/supabase-admin";

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const token = authHeader.slice(7);
  const admin = createAdminClient();

  // Validate the token and get the user — admin client bypasses RLS entirely
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const userId = userData.user.id;

  // Confirm a patients row exists with this user's ID
  const { data: patientRow, error: patientError } = await admin
    .from("patients")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (patientError) {
    return NextResponse.json({ error: "lookup_failed" }, { status: 500 });
  }

  if (!patientRow) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
