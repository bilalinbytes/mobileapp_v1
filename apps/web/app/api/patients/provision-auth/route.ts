import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/server/supabase-admin";

/**
 * POST /api/patients/provision-auth
 *
 * Called immediately after a patient record is created by a doctor.
 * Creates (or confirms) a Supabase Auth user for the patient's phone number
 * so they can log in via OTP.
 *
 * Body: { patientId: string; mobile_number: string }
 *
 * Uses the admin client (service role) to create the auth user without
 * sending an OTP — the patient will receive their first OTP when they
 * actually try to log in.
 */
export async function POST(request: Request): Promise<NextResponse> {
  // Verify the caller is an authenticated doctor
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  // Confirm caller is a doctor
  const { data: doctorRow } = await supabase
    .from("doctors")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (!doctorRow) {
    return NextResponse.json({ error: "Forbidden — doctors only" }, { status: 403 });
  }

  // Parse body
  let body: { patientId?: string; mobile_number?: string };
  try {
    body = await request.json() as { patientId?: string; mobile_number?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { patientId, mobile_number } = body;

  if (!patientId || !mobile_number) {
    return NextResponse.json(
      { error: "patientId and mobile_number are required" },
      { status: 400 }
    );
  }

  // Normalize the phone number to E.164 (+91XXXXXXXXXX)
  const digits = mobile_number.replace(/\D/g, "");
  let nationalNumber = digits;
  if (digits.startsWith("91") && digits.length === 12) {
    nationalNumber = digits.slice(2);
  }
  if (!/^[6-9]\d{9}$/.test(nationalNumber)) {
    return NextResponse.json(
      { error: "Invalid Indian mobile number" },
      { status: 400 }
    );
  }
  const normalizedPhone = `+91${nationalNumber}`;

  // Verify the patient record belongs to this doctor
  const { data: patientRow } = await supabase
    .from("patients")
    .select("id, doctor_id, mobile_number")
    .eq("id", patientId)
    .maybeSingle();

  if (!patientRow) {
    return NextResponse.json({ error: "Patient not found" }, { status: 404 });
  }

  if (patientRow.doctor_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();

  // Check if an auth user already exists with this phone
  // (handles re-registration or duplicate attempts gracefully)
  const { data: existingUsers } = await admin.auth.admin.listUsers();
  const alreadyExists = existingUsers?.users?.some(
    (u) => u.phone === normalizedPhone
  );

  if (alreadyExists) {
    // Auth user already exists — patient can already log in. This is fine.
    return NextResponse.json({ ok: true, created: false });
  }

  // Create the Supabase Auth user with the patient's UUID as their auth ID.
  // This ensures auth.uid() === patients.id, which is what the middleware
  // and PatientContext rely on.
  const { error: createError } = await admin.auth.admin.createUser({
    id: patientId,          // Force the auth UUID to match the patients table PK
    phone: normalizedPhone,
    phone_confirm: true,    // Mark phone as confirmed — no OTP needed at creation
    user_metadata: {
      name: patientRow.mobile_number, // store for reference
      role: "patient",
    },
  });

  if (createError) {
    // If the user already exists with this ID, that's fine
    if (
      createError.message.includes("already exists") ||
      createError.message.includes("duplicate")
    ) {
      return NextResponse.json({ ok: true, created: false });
    }
    return NextResponse.json(
      { error: `Auth provisioning failed: ${createError.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, created: true });
}
