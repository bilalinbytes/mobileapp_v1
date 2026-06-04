import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/server/supabase-admin";

export async function POST(): Promise<NextResponse> {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const { data: doctorRow } = await supabase
    .from("doctors").select("id").eq("id", user.id).maybeSingle();
  if (!doctorRow) {
    return NextResponse.json({ error: "Forbidden — doctors only" }, { status: 403 });
  }

  const { data: patients, error: patientsError } = await supabase
    .from("patients").select("id, mobile_number").eq("doctor_id", user.id);
  if (patientsError || !patients) {
    return NextResponse.json({ error: "Failed to fetch patients" }, { status: 500 });
  }

  const admin = createAdminClient();

  // Fetch ALL existing auth users (paginated)
  const allAuthUsers: { id: string; phone?: string }[] = [];
  let page = 1;
  while (true) {
    const { data: pageData } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    const users = pageData?.users ?? [];
    if (users.length === 0) break;
    allAuthUsers.push(...users.map(u => ({ id: u.id, phone: u.phone })));
    if (users.length < 1000) break;
    page++;
  }

  const authByPhone = new Map(allAuthUsers.filter(u => u.phone).map(u => [u.phone!, u.id]));
  const authById = new Set(allAuthUsers.map(u => u.id));

  const results: {
    id: string; phone: string;
    status: "created" | "exists" | "fixed" | "skipped" | "error";
    error?: string;
  }[] = [];

  for (const patient of patients) {
    const raw = (patient.mobile_number ?? "").trim();
    const digits = raw.replace(/\D/g, "");
    let national = digits;
    if (digits.startsWith("91") && digits.length === 12) national = digits.slice(2);
    if (digits.length === 10) national = digits;

    if (!/^[6-9]\d{9}$/.test(national)) {
      results.push({ id: patient.id, phone: raw, status: "skipped", error: `Invalid phone: "${raw}"` });
      continue;
    }

    const normalizedPhone = `+91${national}`;

    // Fix stored phone if missing +91
    if (raw !== normalizedPhone) {
      await admin.from("patients").update({ mobile_number: normalizedPhone }).eq("id", patient.id);
    }

    // Case 1: Auth user already exists with the correct UUID → done
    if (authById.has(patient.id)) {
      results.push({ id: patient.id, phone: normalizedPhone, status: "exists" });
      continue;
    }

    // Case 2: Auth user exists with this phone but WRONG UUID
    // The patients.id must match auth.uid() for login to work.
    // Fix: update patients.id to match the existing auth user's UUID using raw SQL.
    const existingAuthId = authByPhone.get(normalizedPhone);
    if (existingAuthId) {
      try {
        // Use the Supabase admin REST API to run raw SQL
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

        const sqlRes = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": serviceKey,
            "Authorization": `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({
            query: `UPDATE patients SET id = '${existingAuthId}' WHERE id = '${patient.id}'`
          }),
        });

        if (!sqlRes.ok) {
          // exec_sql RPC may not exist — provide clear manual instructions
          results.push({
            id: patient.id, phone: normalizedPhone, status: "error",
            error: `UUID mismatch detected. Run this SQL in Supabase SQL Editor: UPDATE patients SET id='${existingAuthId}' WHERE id='${patient.id}'`
          });
        } else {
          results.push({ id: patient.id, phone: normalizedPhone, status: "fixed" });
        }
      } catch {
        results.push({
          id: patient.id, phone: normalizedPhone, status: "error",
          error: `UUID mismatch. Fix in Supabase SQL Editor: UPDATE patients SET id='${existingAuthId}' WHERE id='${patient.id}'`
        });
      }
      continue;
    }

    // Case 3: No auth user at all → create one
    const { error: createError } = await admin.auth.admin.createUser({
      id: patient.id,
      phone: normalizedPhone,
      phone_confirm: true,
      user_metadata: { role: "patient" },
    });

    if (createError) {
      results.push({ id: patient.id, phone: normalizedPhone, status: "error", error: createError.message });
    } else {
      results.push({ id: patient.id, phone: normalizedPhone, status: "created" });
    }
  }

  const created = results.filter(r => r.status === "created").length;
  const fixed = results.filter(r => r.status === "fixed").length;
  const existed = results.filter(r => r.status === "exists").length;
  const skipped = results.filter(r => r.status === "skipped").length;
  const errors = results.filter(r => r.status === "error");

  return NextResponse.json({
    ok: true,
    total: patients.length,
    created,
    fixed,
    already_existed: existed,
    skipped,
    errors: errors.length,
    error_details: errors,
    all_results: results,
  });
}
