import { createAdminClient } from "@/lib/server/supabase-admin";
import { normalizeIndianPhone } from "@/lib/server/phone";
import crypto from "crypto";

export interface PatientLookupResult {
  patient_id: string;
  primary_mobile_number: string;
}

/**
 * Normalizes and looks up a patient by mobile_number or alternate_mobile_number.
 * Uses the admin client to bypass Row Level Security (RLS) during login.
 * 
 * @param typedMobile The mobile number input from the patient login form
 * @returns An object containing the patient's ID and primary mobile number, or null if not found
 */
export async function lookupPatientByMobile(
  typedMobile: string
): Promise<PatientLookupResult | null> {
  let normalizedPhone: string;
  try {
    normalizedPhone = normalizeIndianPhone(typedMobile);
  } catch (error) {
    // If the input doesn't normalize, it's definitely not in the database
    return null;
  }

  const admin = createAdminClient();

  const { data, error } = await admin
    .from("patients")
    .select("id, mobile_number")
    .or(`mobile_number.eq.${normalizedPhone},alternate_mobile_number.eq.${normalizedPhone}`)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return {
    patient_id: data.id,
    primary_mobile_number: data.mobile_number,
  };
}

/**
 * Generates a cryptographically secure 6-digit numeric OTP.
 */
export function generateOtp(): string {
  // Generates a random number in the range [100000, 999999]
  const num = crypto.randomInt(100000, 1000000);
  return num.toString();
}

/**
 * Computes the SHA-256 hash of a string (such as an OTP).
 */
export function hashOtp(otp: string): string {
  return crypto.createHash("sha256").update(otp).digest("hex");
}
