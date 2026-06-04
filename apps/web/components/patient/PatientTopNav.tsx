"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Calendar } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { SaansBrandIcon } from "@/components/auth/SaansBrandIcon";
import { usePatient } from "@/contexts/PatientContext";
import styles from "./PatientTopNav.module.css";

type View = "home" | "log" | "analytics" | "appointments";

interface PatientTopNavProps {
  activeView: View;
  onViewChange: (v: View) => void;
}

const TABS: { id: View; label: string; labelHi: string }[] = [
  { id: "home", label: "My Health", labelHi: "मेरा स्वास्थ्य" },
  { id: "log", label: "Log Today", labelHi: "आज लॉग करें" },
  { id: "analytics", label: "Analytics", labelHi: "विश्लेषण" },
  { id: "appointments", label: "Book Appointment", labelHi: "अपॉइंटमेंट" },
];

interface PrescriptionNotificationMed {
  id: string;
  drug_name: string;
  dose: number | null;
  dose_unit: string | null;
  route: string;
  frequency: string | null;
}

interface PrescriptionNotification {
  date: string;
  created_at: string | null;
  medications: PrescriptionNotificationMed[];
}

interface PatientInstruction {
  instruction_text: string;
}

interface AppointmentNotification {
  id: string;
  scheduled_at: string;
  status: string;
  updated_at: string | null;
  created_at: string | null;
  meta?: {
    doctor_remarks?: string;
    mode?: string;
    reason?: string;
    workflow_status?: string;
  };
}

interface ProfileMeta {
  doctorName: string;
  doctorHospital: string;
  diagnosis: string;
  nextAppointment: string;
}

function formatDateTime(value: string | null | undefined, fallbackDate?: string) {
  const source = value ?? fallbackDate;
  if (!source) return "";
  return new Date(source).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(value: string | null | undefined) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function isWithinOneDay(value: string | null | undefined, fallbackDate?: string) {
  const source = value ?? fallbackDate;
  if (!source) return false;
  const timestamp = new Date(source).getTime();
  if (Number.isNaN(timestamp)) return false;
  return Date.now() - timestamp < 24 * 60 * 60 * 1000;
}

export function PatientTopNav({ activeView, onViewChange }: PatientTopNavProps) {
  const router = useRouter();
  const { patient } = usePatient();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [latestPrescription, setLatestPrescription] = useState<PrescriptionNotification | null>(null);
  const [latestInstruction, setLatestInstruction] = useState<PatientInstruction | null>(null);
  const [appointmentNotification, setAppointmentNotification] = useState<AppointmentNotification | null>(null);
  const [profileMeta, setProfileMeta] = useState<ProfileMeta>({
    doctorName: "Assigned doctor",
    doctorHospital: "",
    diagnosis: "Not recorded",
    nextAppointment: "Not scheduled",
  });

  useEffect(() => {
    let cancelled = false;

    fetch("/api/patient/prescriptions", { credentials: "include" })
      .then((response) => response.ok ? response.json() : null)
      .then((body: { prescriptions?: PrescriptionNotification[]; instruction?: PatientInstruction | null } | null) => {
        if (cancelled) return;
        setLatestPrescription(body?.prescriptions?.[0] ?? null);
        setLatestInstruction(body?.instruction ?? null);
      })
      .catch(() => {
        if (!cancelled) {
          setLatestPrescription(null);
          setLatestInstruction(null);
        }
      });

    return () => { cancelled = true; };
  }, [patient?.id]);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/patient/appointments", { credentials: "include" })
      .then((response) => response.ok ? response.json() : null)
      .then((body: { appointments?: AppointmentNotification[] } | null) => {
        if (cancelled) return;
        const latest = (body?.appointments ?? []).find((appointment) => {
          const status = appointment.meta?.workflow_status ?? appointment.status;
          return ["approved", "rejected", "reschedule_suggested"].includes(status);
        }) ?? null;
        setAppointmentNotification(latest);
      })
      .catch(() => {
        if (!cancelled) setAppointmentNotification(null);
      });

    return () => { cancelled = true; };
  }, [patient?.id]);

  useEffect(() => {
    if (!patient?.id) return;
    let cancelled = false;
    const supabase = createClient();
    const currentPatient = patient;

    async function loadProfileMeta() {
      const [doctorPayload, diagnosisRes, sessionRes] = await Promise.all([
        currentPatient.doctor_id
          ? fetch("/api/patient-doctor", { credentials: "include" })
              .then((response) => response.ok ? response.json() : null)
              .catch(() => null)
          : Promise.resolve(null),
        supabase
          .from("patient_diagnoses")
          .select("primary_diagnosis, effective_dashboard")
          .eq("patient_id", currentPatient.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .single(),
        supabase.auth.getSession(),
      ]);

      let nextAppointment = "Not scheduled";
      const token = sessionRes.data.session?.access_token;
      if (token) {
        const appointmentBody = await fetch("/api/appointments/next", {
          headers: { Authorization: `Bearer ${token}` },
        })
          .then((response) => response.ok ? response.json() : null)
          .catch(() => null);

        if (appointmentBody?.appointment?.scheduled_at) {
          nextAppointment = formatDate(appointmentBody.appointment.scheduled_at);
        }
      }

      if (cancelled) return;
      const doctor = doctorPayload?.doctor as { name?: string | null; hospital?: string | null } | null | undefined;
      setProfileMeta({
        doctorName: doctor?.name ?? "Assigned doctor",
        doctorHospital: doctor?.hospital ?? "",
        diagnosis: diagnosisRes.data?.primary_diagnosis ?? currentPatient.effective_dashboard ?? "Not recorded",
        nextAppointment,
      });
    }

    loadProfileMeta().catch(() => {
      if (!cancelled) {
        setProfileMeta((current) => ({
          ...current,
          diagnosis: currentPatient.effective_dashboard ?? current.diagnosis,
        }));
      }
    });

    return () => { cancelled = true; };
  }, [patient?.id, patient?.doctor_id, patient?.effective_dashboard]);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  const patientName = patient?.name || "Patient";
  const initials = patientName.split(" ").map((n: string) => n[0] ?? "").join("").toUpperCase();
  const latestPrescriptionSummary = latestPrescription
    ? latestPrescription.medications
        .slice(0, 3)
        .map((medication) => {
          const dose = medication.dose !== null ? ` ${medication.dose} ${medication.dose_unit ?? ""}`.trimEnd() : "";
          return `${medication.drug_name}${dose}`;
        })
        .join(", ") + (latestPrescription.medications.length > 3 ? ` +${latestPrescription.medications.length - 3} more` : "")
    : "No prescription yet";
  const showPrescriptionBadge = latestPrescription
    ? isWithinOneDay(latestPrescription.created_at, latestPrescription.date)
    : false;
  const showAppointmentBadge = appointmentNotification
    ? isWithinOneDay(appointmentNotification.updated_at, appointmentNotification.created_at ?? undefined)
    : false;
  const notificationCount = (showPrescriptionBadge ? 1 : 0) + (showAppointmentBadge ? 1 : 0);
  const appointmentStatus = appointmentNotification?.meta?.workflow_status ?? appointmentNotification?.status;

  return (
    <nav className={styles.nav}>
      <div className={styles.brand}>
        <SaansBrandIcon className={styles.brandIcon} />
        <div>
          <p className={styles.brandName}>Saans Sync</p>
          <p className={styles.brandSub}>Respiratory health companion · श्वसन स्वास्थ्य साथी</p>
        </div>
      </div>

      <div className={styles.tabs}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`${styles.tab} ${activeView === tab.id ? styles.tabActive : ""}`}
            onClick={() => onViewChange(tab.id)}
          >
            <span className={styles.tabEn}>{tab.label}</span>
            <span className={styles.tabHi}>{tab.labelHi}</span>
          </button>
        ))}
      </div>

      <div className={styles.right}>
        <div className={styles.notificationWrap}>
          <button
            type="button"
            className={styles.notifBtn}
            aria-label="Notifications"
            aria-expanded={notificationsOpen}
            onClick={() => {
              setNotificationsOpen((open) => !open);
              setProfileOpen(false);
            }}
          >
            <Bell size={15} strokeWidth={1.7} />
            {notificationCount > 0 && <span className={styles.notifBadge}>{notificationCount}</span>}
          </button>
          {notificationsOpen && (
            <div className={styles.notifPanel}>
              {appointmentNotification && (
                <div className={styles.notifSection}>
                  <p className={styles.notifTitle}>
                    {appointmentStatus === "approved"
                      ? "Appointment Approved"
                      : appointmentStatus === "rejected"
                        ? "Appointment Rejected"
                        : "Appointment Rescheduled"}
                  </p>
                  <p className={styles.notifTime}>{formatDateTime(appointmentNotification.scheduled_at)}</p>
                  {appointmentNotification.meta?.doctor_remarks && (
                    <p className={styles.notifInstruction}>{appointmentNotification.meta.doctor_remarks}</p>
                  )}
                </div>
              )}
              {latestPrescription ? (
                <>
                  <p className={styles.notifTitle}>Emergency Prescription</p>
                  <p className={styles.notifTime}>
                    {formatDateTime(latestPrescription.created_at, latestPrescription.date)}
                  </p>
                  <div className={styles.notifMedList}>
                    {latestPrescription.medications.slice(0, 4).map((medication) => (
                      <p key={medication.id} className={styles.notifMed}>
                        {medication.drug_name}
                        {medication.dose !== null ? ` ${medication.dose} ${medication.dose_unit ?? ""}` : ""}
                        {medication.frequency ? ` - ${medication.frequency}` : ""}
                      </p>
                    ))}
                  </div>
                  {latestInstruction?.instruction_text && (
                    <p className={styles.notifInstruction}>{latestInstruction.instruction_text}</p>
                  )}
                </>
              ) : !appointmentNotification ? (
                <p className={styles.notifEmpty}>No prescription notifications yet.</p>
              ) : null}
            </div>
          )}
        </div>
        <button type="button" className={styles.logoutBtn} onClick={handleLogout}>
          <span className={styles.logoutEn}>Sign Out</span>
          <span className={styles.logoutHi}>साइन आउट</span>
        </button>
        <div className={styles.profileWrap}>
          <button
            type="button"
            className={styles.patientPill}
            aria-label="View profile"
            aria-expanded={profileOpen}
            onClick={() => {
              setProfileOpen((open) => !open);
              setNotificationsOpen(false);
            }}
          >
            <div className={styles.patientAvatar}>{initials}</div>
            <span className={styles.patientName}>{patientName.split(" ")[0]}</span>
          </button>
          {profileOpen && (
            <div className={styles.profilePanel}>
              <div className={styles.profileHeader}>
                <div className={styles.profileAvatar}>{initials || "PT"}</div>
                <div>
                  <p className={styles.profileTitle}>Patient Profile</p>
                  <p className={styles.profileName}>{patientName}</p>
                  <p className={styles.profileSub}>
                    Disease / Diagnosis: <strong>{profileMeta.diagnosis}</strong>
                  </p>
                </div>
              </div>

              <div className={styles.profileGrid}>
                <div className={styles.profileInfoBox}>
                  <p className={styles.profileLabel}>Doctor</p>
                  <p className={styles.profileValue}>{profileMeta.doctorName}</p>
                  {profileMeta.doctorHospital && <p className={styles.profileMuted}>{profileMeta.doctorHospital}</p>}
                </div>
                <div className={styles.profileInfoBox}>
                  <div className={styles.profileLabelIcon}>
                    <Calendar size={13} />
                    <p className={styles.profileLabel}>Next Appointment</p>
                  </div>
                  <p className={styles.profileValue}>{profileMeta.nextAppointment}</p>
                </div>
                <div className={styles.profileInfoBoxAccent}>
                  <p className={styles.profileLabel}>Last Prescribed</p>
                  <p className={styles.profileValue}>
                    {latestPrescription ? formatDate(latestPrescription.created_at ?? latestPrescription.date) : "No prescription yet"}
                  </p>
                  <p className={styles.profileMuted}>{latestPrescriptionSummary}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
