import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/server/supabase-admin";
import type { Database } from "@/lib/database.types";

type AppointmentRow = Database["public"]["Tables"]["appointments"]["Row"];

type AppointmentNoteMeta = {
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
};

const createSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time_slot: z.string().regex(/^\d{2}:\d{2}$/),
  reason: z.string().max(500).optional(),
  mode: z.enum(["Clinic", "Online Consultation"]),
});

const updateSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(["accept_reschedule", "request_another_slot"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  time_slot: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  remarks: z.string().max(500).optional(),
});

async function authenticatePatient() {
  const supabase = await createServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

function scheduledAt(date: string, timeSlot: string) {
  return `${date}T${timeSlot}:00+05:30`;
}

function parseNotes(notes: string | null): AppointmentNoteMeta {
  if (!notes) return {};
  try {
    const parsed = JSON.parse(notes) as AppointmentNoteMeta;
    return parsed && typeof parsed === "object" ? parsed : { reason: notes };
  } catch {
    return { reason: notes };
  }
}

function serializeAppointment(row: AppointmentRow) {
  return {
    ...row,
    meta: parseNotes(row.notes),
  };
}

export async function GET(): Promise<NextResponse> {
  const user = await authenticatePatient();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("appointments")
    .select("*")
    .eq("patient_id", user.id)
    .order("updated_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false, nullsFirst: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    appointments: (data as AppointmentRow[]).map(serializeAppointment),
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  const user = await authenticatePatient();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null) as unknown;
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: patient } = await admin
    .from("patients")
    .select("doctor_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!patient?.doctor_id) {
    return NextResponse.json({ error: "No doctor assigned to this patient." }, { status: 400 });
  }

  const appointmentTime = scheduledAt(parsed.data.date, parsed.data.time_slot);
  const now = new Date().toISOString();
  const meta: AppointmentNoteMeta = {
    reason: parsed.data.reason?.trim() || undefined,
    mode: parsed.data.mode,
    workflow_status: "requested",
    history: [{
      action: "Appointment requested",
      actor: "patient",
      at: now,
      scheduled_at: appointmentTime,
      remarks: parsed.data.reason?.trim() || undefined,
    }],
  };

  const { data, error } = await admin
    .from("appointments")
    .insert({
      patient_id: user.id,
      doctor_id: patient.doctor_id,
      scheduled_at: appointmentTime,
      title: `Appointment Request - ${parsed.data.mode}`,
      notes: JSON.stringify(meta),
      status: "upcoming",
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ appointment: serializeAppointment(data as AppointmentRow) }, { status: 201 });
}

export async function PATCH(request: Request): Promise<NextResponse> {
  const user = await authenticatePatient();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null) as unknown;
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("appointments")
    .select("*")
    .eq("id", parsed.data.id)
    .eq("patient_id", user.id)
    .maybeSingle();

  if (!existing) return NextResponse.json({ error: "Appointment not found" }, { status: 404 });

  const row = existing as AppointmentRow;
  const meta = parseNotes(row.notes);
  const now = new Date().toISOString();
  let status = "upcoming";
  let workflowStatus = "patient_accepted";
  let nextScheduledAt = row.scheduled_at;
  let action = "Patient accepted suggested appointment";

  if (parsed.data.action === "request_another_slot") {
    if (!parsed.data.date || !parsed.data.time_slot) {
      return NextResponse.json({ error: "Date and time are required for another slot." }, { status: 400 });
    }
    workflowStatus = "patient_requested_another";
    nextScheduledAt = scheduledAt(parsed.data.date, parsed.data.time_slot);
    action = "Patient requested another slot";
  }

  meta.history = [
    ...(meta.history ?? []),
    {
      action,
      actor: "patient",
      at: now,
      scheduled_at: nextScheduledAt,
      remarks: parsed.data.remarks?.trim() || undefined,
    },
  ];
  meta.workflow_status = workflowStatus;

  const { data, error } = await admin
    .from("appointments")
    .update({
      status,
      scheduled_at: nextScheduledAt,
      notes: JSON.stringify(meta),
      updated_at: now,
    })
    .eq("id", row.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ appointment: serializeAppointment(data as AppointmentRow) });
}
