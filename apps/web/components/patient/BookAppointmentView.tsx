"use client";

import { useEffect, useState } from "react";
import { CalendarClock, CheckCircle, Clock, XCircle } from "lucide-react";
import dStyles from "@/components/patient/disease.module.css";

type Mode = "Clinic" | "Online Consultation";

interface AppointmentMeta {
  reason?: string;
  mode?: Mode;
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

interface AppointmentItem {
  id: string;
  scheduled_at: string;
  status: string;
  title: string;
  created_at: string | null;
  updated_at: string | null;
  meta?: AppointmentMeta;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusLabel(status: string) {
  if (status === "requested") return "Pending doctor approval";
  if (status === "approved" || status === "patient_accepted") return "Approved";
  if (status === "rejected") return "Rejected";
  if (status === "reschedule_suggested") return "New date/time suggested";
  if (status === "patient_requested_another") return "Another slot requested";
  return status.replace(/_/g, " ");
}

function workflowStatus(appointment: AppointmentItem) {
  return appointment.meta?.workflow_status ?? appointment.status;
}

function statusIcon(status: string) {
  if (status === "approved" || status === "patient_accepted") return <CheckCircle size={15} color="#0f6e56" />;
  if (status === "rejected") return <XCircle size={15} color="#c94d49" />;
  return <Clock size={15} color="#d85a30" />;
}

export function BookAppointmentView() {
  const [date, setDate] = useState("");
  const [timeSlot, setTimeSlot] = useState("");
  const [reason, setReason] = useState("");
  const [mode, setMode] = useState<Mode>("Clinic");
  const [appointments, setAppointments] = useState<AppointmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [anotherSlot, setAnotherSlot] = useState<Record<string, { date: string; time: string; remarks: string }>>({});

  async function loadAppointments() {
    setLoading(true);
    const response = await fetch("/api/patient/appointments", { credentials: "include" });
    const body = await response.json().catch(() => null) as { appointments?: AppointmentItem[]; error?: string } | null;
    if (response.ok) setAppointments(body?.appointments ?? []);
    setLoading(false);
  }

  useEffect(() => {
    void loadAppointments();
  }, []);

  async function submitRequest() {
    if (!date || !timeSlot || submitting) return;
    setSubmitting(true);
    setMessage(null);
    const response = await fetch("/api/patient/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ date, time_slot: timeSlot, reason: reason.trim() || undefined, mode }),
    });
    const body = await response.json().catch(() => null) as { error?: string } | null;
    setSubmitting(false);
    if (!response.ok) {
      setMessage(body?.error ?? "Could not send appointment request.");
      return;
    }
    setDate("");
    setTimeSlot("");
    setReason("");
    setMode("Clinic");
    setMessage("Appointment request sent to your doctor.");
    await loadAppointments();
  }

  async function respondToReschedule(id: string, action: "accept_reschedule" | "request_another_slot") {
    const slot = anotherSlot[id] ?? { date: "", time: "", remarks: "" };
    if (action === "request_another_slot" && (!slot.date || !slot.time)) {
      setMessage("Please choose another date and time.");
      return;
    }

    const response = await fetch("/api/patient/appointments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        id,
        action,
        date: action === "request_another_slot" ? slot.date : undefined,
        time_slot: action === "request_another_slot" ? slot.time : undefined,
        remarks: slot.remarks || undefined,
      }),
    });
    const body = await response.json().catch(() => null) as { error?: string } | null;
    if (!response.ok) {
      setMessage(body?.error ?? "Could not update appointment.");
      return;
    }
    setMessage(action === "accept_reschedule" ? "Appointment accepted." : "Another slot request sent.");
    await loadAppointments();
  }

  return (
    <div className={dStyles.view}>
      <div className={dStyles.pageHeader}>
        <div>
          <h1 className={dStyles.pageTitle}>Book Appointment</h1>
          <p className={dStyles.pageSub}>Choose your preferred date, time, reason, and consultation mode.</p>
        </div>
      </div>

      <div className={dStyles.body}>
        <div className={dStyles.card}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <CalendarClock size={17} color="#126969" />
            <p className={dStyles.cardTitle} style={{ margin: 0 }}>Appointment Request</p>
          </div>
          <div className={dStyles.grid2}>
            <div>
              <label className={dStyles.fieldLabel}>Date <span className={dStyles.req}>*</span></label>
              <input className={dStyles.numInput} style={{ fontSize: 16, fontFamily: "var(--font-dm-sans), system-ui, sans-serif" }} type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            </div>
            <div>
              <label className={dStyles.fieldLabel}>Time slot <span className={dStyles.req}>*</span></label>
              <input className={dStyles.numInput} style={{ fontSize: 16, fontFamily: "var(--font-dm-sans), system-ui, sans-serif" }} type="time" value={timeSlot} onChange={(event) => setTimeSlot(event.target.value)} />
            </div>
          </div>
          <div style={{ marginTop: 14 }}>
            <label className={dStyles.fieldLabel}>Mode</label>
            <div className={dStyles.yesNoRow}>
              {(["Clinic", "Online Consultation"] as Mode[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  className={dStyles.yesNoBtn}
                  style={mode === item ? { background: "#0f6e56", borderColor: "#0f6e56", color: "white" } : {}}
                  onClick={() => setMode(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
          <div style={{ marginTop: 14 }}>
            <label className={dStyles.fieldLabel}>Reason for visit optional</label>
            <textarea className={dStyles.textarea} rows={3} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Short reason for the visit..." />
          </div>
          {message && <p className={dStyles.cardSub} style={{ margin: "12px 0 0", color: message.includes("Could") || message.includes("Please") ? "#c94d49" : "#0f6e56", fontWeight: 700 }}>{message}</p>}
          <div className={dStyles.submitRow} style={{ paddingBottom: 0 }}>
            <button type="button" className={dStyles.submitBtn} disabled={!date || !timeSlot || submitting} onClick={submitRequest}>
              {submitting ? "Sending..." : "Submit Appointment Request"}
            </button>
          </div>
        </div>

        <div className={dStyles.card}>
          <p className={dStyles.cardTitle}>Appointment History</p>
          {loading ? (
            <p className={dStyles.cardSub}>Loading appointments...</p>
          ) : appointments.length === 0 ? (
            <p className={dStyles.cardSub}>No appointment requests yet.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {appointments.map((appointment) => (
                <div key={appointment.id} style={{ border: "1px solid rgba(19,45,54,0.08)", borderRadius: 8, padding: 12, background: "#f8f7f5" }}>
                  {(() => {
                    const displayStatus = workflowStatus(appointment);
                    return (
                      <>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                    <div>
                      <p style={{ margin: 0, fontWeight: 800, color: "#132d36", fontSize: 13 }}>{formatDateTime(appointment.scheduled_at)}</p>
                      <p style={{ margin: "3px 0 0", color: "#6d8794", fontSize: 12 }}>{appointment.meta?.mode ?? "Clinic"}{appointment.meta?.reason ? ` - ${appointment.meta.reason}` : ""}</p>
                    </div>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 800, color: "#132d36" }}>
                      {statusIcon(displayStatus)} {statusLabel(displayStatus)}
                    </span>
                  </div>
                  {appointment.meta?.doctor_remarks && (
                    <p style={{ margin: "8px 0 0", fontSize: 12, color: "#6d8794" }}>Doctor remarks: {appointment.meta.doctor_remarks}</p>
                  )}
                  {displayStatus === "reschedule_suggested" && (
                    <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                      <button type="button" className={dStyles.btnPrimary} onClick={() => respondToReschedule(appointment.id, "accept_reschedule")}>Accept Suggested Slot</button>
                      <div className={dStyles.grid2}>
                        <input className={dStyles.numInput} style={{ fontSize: 14, height: 42, fontFamily: "var(--font-dm-sans), system-ui, sans-serif" }} type="date" value={anotherSlot[appointment.id]?.date ?? ""} onChange={(event) => setAnotherSlot((current) => ({ ...current, [appointment.id]: { ...(current[appointment.id] ?? { date: "", time: "", remarks: "" }), date: event.target.value } }))} />
                        <input className={dStyles.numInput} style={{ fontSize: 14, height: 42, fontFamily: "var(--font-dm-sans), system-ui, sans-serif" }} type="time" value={anotherSlot[appointment.id]?.time ?? ""} onChange={(event) => setAnotherSlot((current) => ({ ...current, [appointment.id]: { ...(current[appointment.id] ?? { date: "", time: "", remarks: "" }), time: event.target.value } }))} />
                      </div>
                      <textarea className={dStyles.textarea} rows={2} placeholder="Optional note for doctor..." value={anotherSlot[appointment.id]?.remarks ?? ""} onChange={(event) => setAnotherSlot((current) => ({ ...current, [appointment.id]: { ...(current[appointment.id] ?? { date: "", time: "", remarks: "" }), remarks: event.target.value } }))} />
                      <button type="button" className={dStyles.emergencySendBtn} onClick={() => respondToReschedule(appointment.id, "request_another_slot")}>Request Another Slot</button>
                    </div>
                  )}
                      </>
                    );
                  })()}
                  {appointment.meta?.history && appointment.meta.history.length > 0 && (
                    <div style={{ marginTop: 10, borderTop: "1px solid rgba(19,45,54,0.08)", paddingTop: 8 }}>
                      {appointment.meta.history.slice(-3).map((event) => (
                        <p key={`${event.at}-${event.action}`} style={{ margin: "3px 0", fontSize: 11, color: "#77736b" }}>
                          {formatDateTime(event.at)} - {event.action}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
