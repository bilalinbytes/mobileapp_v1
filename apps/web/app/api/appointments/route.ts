import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/server/supabase-admin";
import type { Database } from "@/lib/database.types";

type AppointmentRow = Database["public"]["Tables"]["appointments"]["Row"];
type AppointmentStatus =
  | "requested"
  | "approved"
  | "rejected"
  | "reschedule_suggested"
  | "patient_accepted"
  | "patient_requested_another"
  | "upcoming"
  | "completed"
  | "cancelled";

interface AppointmentNoteMeta {
  reason?: string;
  mode?: "Clinic" | "Online Consultation";
  doctor_remarks?: string;
  workflow_status?: string;
  history?: Array<{
    action: string;
    actor: "patient" | "doctor";
    at: string;
    scheduled_at?: string;
    remarks?: string;
  }>;
}

const createSchema = z.object({
  patient_id: z.string().uuid(),
  scheduled_at: z.string().datetime({ offset: true }),
  title: z.string().min(1).max(200),
  notes: z.string().max(5000).optional(),
});

const updateSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["requested", "approved", "rejected", "reschedule_suggested", "patient_accepted", "patient_requested_another", "upcoming", "completed", "cancelled"]).optional(),
  scheduled_at: z.string().datetime({ offset: true }).optional(),
  title: z.string().min(1).max(200).optional(),
  notes: z.string().max(5000).optional(),
  remarks: z.string().max(500).optional(),
});

function parseNotes(notes: string | null): AppointmentNoteMeta {
  if (!notes) return {};
  try {
    const parsed = JSON.parse(notes) as AppointmentNoteMeta;
    return parsed && typeof parsed === "object" ? parsed : { reason: notes };
  } catch {
    return { reason: notes };
  }
}

function stringifyNotes(meta: AppointmentNoteMeta) {
  return JSON.stringify(meta);
}

function eventName(status: AppointmentStatus) {
  if (status === "approved") return "Appointment approved";
  if (status === "rejected") return "Appointment rejected";
  if (status === "reschedule_suggested") return "Doctor suggested new date/time";
  if (status === "completed") return "Appointment completed";
  if (status === "cancelled") return "Appointment cancelled";
  return "Appointment updated";
}

function dbStatusForWorkflow(status: AppointmentStatus | undefined) {
  if (status === "rejected" || status === "cancelled") return "cancelled";
  if (status === "completed") return "completed";
  return "upcoming";
}

async function authenticateDoctor() {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

// GET /api/appointments?patient_id=<uuid>
// Returns all appointments for a patient, or all doctor appointments when no patient_id is supplied.
export async function GET(request: Request): Promise<NextResponse> {
  const user = await authenticateDoctor();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const patientId = searchParams.get("patient_id");

  const admin = createAdminClient();

  if (!patientId) {
    const { data, error } = await admin
      .from("appointments")
      .select("*, patients(name)")
      .eq("doctor_id", user.id)
      .order("updated_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false, nullsFirst: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ appointments: data });
  }

  // Verify the requesting doctor owns this patient
  const { data: patient } = await admin
    .from("patients")
    .select("doctor_id")
    .eq("id", patientId)
    .maybeSingle();

  if (!patient) {
    return NextResponse.json({ error: "Patient not found" }, { status: 404 });
  }
  if (patient.doctor_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await admin
    .from("appointments")
    .select("*")
    .eq("patient_id", patientId)
    .order("scheduled_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ appointments: data as AppointmentRow[] });
}

// POST /api/appointments — create a new appointment
export async function POST(request: Request): Promise<NextResponse> {
  const user = await authenticateDoctor();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  const admin = createAdminClient();

  // Verify doctor owns this patient
  const { data: patient } = await admin
    .from("patients")
    .select("doctor_id")
    .eq("id", parsed.data.patient_id)
    .maybeSingle();

  if (!patient) {
    return NextResponse.json({ error: "Patient not found" }, { status: 404 });
  }
  if (patient.doctor_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await admin
    .from("appointments")
    .insert({
      patient_id: parsed.data.patient_id,
      doctor_id: user.id,
      scheduled_at: parsed.data.scheduled_at,
      title: parsed.data.title,
      notes: parsed.data.notes ?? null,
      status: "upcoming",
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ appointment: data as AppointmentRow }, { status: 201 });
}

// PATCH /api/appointments — update status, date, or notes
export async function PATCH(request: Request): Promise<NextResponse> {
  const user = await authenticateDoctor();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  const admin = createAdminClient();

  // Verify the appointment belongs to this doctor
  const { data: existing } = await admin
    .from("appointments")
    .select("doctor_id, notes, scheduled_at")
    .eq("id", parsed.data.id)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }
  if (existing.doctor_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id, remarks, ...updates } = parsed.data;
  const current = existing as { doctor_id: string | null; notes?: string | null; scheduled_at?: string | null };
  const nextStatus = updates.status as AppointmentStatus | undefined;
  const nextScheduledAt = updates.scheduled_at;
  let nextNotes = updates.notes;
  const dbStatus = nextStatus ? dbStatusForWorkflow(nextStatus) : updates.status;

  if (nextStatus || remarks || nextScheduledAt) {
    const meta = parseNotes(current.notes ?? null);
    if (remarks) meta.doctor_remarks = remarks;
    if (nextStatus) meta.workflow_status = nextStatus;
    meta.history = [
      ...(meta.history ?? []),
      {
        action: nextStatus ? eventName(nextStatus) : "Appointment updated",
        actor: "doctor",
        at: new Date().toISOString(),
        scheduled_at: nextScheduledAt ?? current.scheduled_at ?? undefined,
        remarks,
      },
    ];
    nextNotes = stringifyNotes(meta);
  }

  const { data, error } = await admin
    .from("appointments")
    .update({ ...updates, status: dbStatus, notes: nextNotes, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ appointment: data as AppointmentRow });
}
