import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/server/supabase-admin";
import crypto from "crypto";

/**
 * POST /api/patient-auth/set-pin
 * 
 * Verifies a valid short-lived otp_token and saves the patient's new 4-digit PIN.
 * The raw PIN is securely hashed using PBKDF2 or SHA-256 with a unique salt and backend pepper.
 * Writes credentials to the `patient_login_security` table.
 * 
 * Body: { otp_token: string, pin: string, confirm_pin: string }
 */
export async function POST(request: Request): Promise<NextResponse> {
  let body: { otp_token?: string; pin?: string; confirm_pin?: string };
  try {
    body = await request.json() as { otp_token?: string; pin?: string; confirm_pin?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { otp_token, pin, confirm_pin } = body;
  if (!otp_token || !pin || !confirm_pin) {
    return NextResponse.json(
      { error: "otp_token, pin, and confirm_pin are required" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // 1. Validate otp_token is valid and unused
  const { data: verifiedSession, error: tokenError } = await admin
    .from("otp_verified_sessions")
    .select("*")
    .eq("token", otp_token)
    .eq("used", false)
    .maybeSingle();

  if (tokenError || !verifiedSession) {
    return NextResponse.json(
      { message: "Invalid or expired verification session. Please verify OTP again." },
      { status: 401 }
    );
  }

  // Check token expiration
  const now = new Date();
  const expiresAt = new Date(verifiedSession.expires_at);
  if (now > expiresAt) {
    return NextResponse.json(
      { message: "Verification session has expired. Please verify OTP again." },
      { status: 401 }
    );
  }

  // 2. Validate pin === confirm_pin
  if (pin !== confirm_pin) {
    return NextResponse.json({ message: "PINs do not match." }, { status: 400 });
  }

  // 3. Validate PIN is exactly 4 digits, numeric
  if (!/^\d{4}$/.test(pin)) {
    return NextResponse.json({ message: "PIN must be exactly 4 numeric digits." }, { status: 400 });
  }

  const { patient_id } = verifiedSession;

  // 4. Generate a unique pin_salt (crypto.randomBytes(16))
  const pinSalt = crypto.randomBytes(16).toString("hex");

  // 5. Hash: pin_hash = hash(pin + pin_salt + BACKEND_PEPPER)
  const backendPepper = process.env.BACKEND_PEPPER || "SaansSyncPepper2026_SecurePepperValue";
  const pinHash = crypto
    .createHash("sha256")
    .update(pin + pinSalt + backendPepper)
    .digest("hex");

  // 6. Write credentials to patient_login_security table
  const { error: dbError } = await admin
    .from("patient_login_security")
    .upsert({
      patient_id,
      pin_hash: pinHash,
      pin_salt: pinSalt,
      pin_hash_algorithm: "sha256",
      pin_set_at: new Date().toISOString(),
      pin_last_changed_at: new Date().toISOString(),
      failed_pin_attempts: 0,
      locked_until: null,
      last_login_at: null,
      last_failed_login_at: null,
    });

  if (dbError) {
    console.error("Database error while writing patient login security:", dbError);
    return NextResponse.json(
      { error: "Database error occurred while setting the PIN." },
      { status: 500 }
    );
  }

  // 6.b Synchronize the salted, peppered pin_hash to Supabase Auth password system
  // Format the password to satisfy any possible password strength policies (uppercase, lowercase, special character, digits)
  const authPassword = "A!" + pinHash + "Z_1";
  const { error: authError } = await admin.auth.admin.updateUserById(patient_id, {
    password: authPassword,
  });

  if (authError) {
    console.error("Failed to sync PIN hash to Supabase Auth password:", authError);
    return NextResponse.json(
      { error: "Failed to update auth credentials. Please try again." },
      { status: 500 }
    );
  }

  // 7. Invalidate the otp_token (set used = true)
  const { error: invalidateError } = await admin
    .from("otp_verified_sessions")
    .update({ used: true })
    .eq("token", otp_token);

  if (invalidateError) {
    console.error("Failed to invalidate otp_verified_session token:", invalidateError);
    // Non-fatal, return success to patient anyway
  }

  return NextResponse.json({
    message: "PIN set successfully",
  });
}
