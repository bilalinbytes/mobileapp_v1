"use client";

import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { PatientProvider, usePatient } from "@/contexts/PatientContext";
import { createClient } from "@/lib/supabase/client";
import { PatientTopNav } from "@/components/patient/PatientTopNav";
import { PatientSidebar } from "@/components/patient/PatientSidebar";
import { HomeView } from "@/components/patient/HomeView";
import { LogTodayView } from "@/components/patient/LogTodayView";
import { PatientAnalyticsView } from "@/components/patient/PatientAnalyticsView";
import { BookAppointmentView } from "@/components/patient/BookAppointmentView";
import { AsthmaHomeView } from "@/components/patient/asthma/AsthmaHomeView";
import { COPDHomeView } from "@/components/patient/copd/COPDHomeView";
import { BronchHomeView } from "@/components/patient/bronchiectasis/BronchHomeView";
import { PostICUHomeView } from "@/components/patient/posticu/PostICUHomeView";
import { ILDHomeView } from "@/components/patient/ild/ILDHomeView";
import { PATIENT_PROFILE } from "@/lib/mock-data";
import { usePatientHomeData } from "@/hooks/usePatientHomeData";
import styles from "./page.module.css";

type View = "home" | "log" | "analytics" | "appointments";

function NewPatientHome({
  patientName,
  doctorName,
  doctorHospital,
  onLogToday,
  hasPreviousLogs = false,
}: {
  patientName: string;
  doctorName: string;
  doctorHospital: string;
  onLogToday: () => void;
  hasPreviousLogs?: boolean;
}) {
  const firstName = patientName.split(" ")[0] || "Patient";
  const introText = hasPreviousLogs
    ? "No health log has been submitted for today yet. Your previous logs are available in Analytics. · आज का स्वास्थ्य लॉग अभी जमा नहीं हुआ है। पुराने लॉग Analytics में उपलब्ध हैं।"
    : "Your dashboard will populate after your first health log. · पहला स्वास्थ्य लॉग भरने के बाद डैशबोर्ड दिखेगा।";

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", marginBottom: 18 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, color: "#1a1a18" }}>Welcome, {firstName} · स्वागत है</h1>
          <p style={{ margin: "6px 0 0", color: "#77736b", fontSize: 14 }}>
            {introText}
          </p>
        </div>
        <button
          type="button"
          onClick={onLogToday}
          style={{
            border: 0,
            borderRadius: 8,
            background: "#0f6e56",
            color: "white",
            padding: "10px 16px",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          + Log Today · आज लॉग करें
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
        <section style={{ background: "#fff", border: "1px solid #e7e1d8", borderRadius: 8, padding: 16 }}>
          <p style={{ margin: 0, color: "#6f6a61", fontSize: 12, fontWeight: 700, textTransform: "uppercase" }}>
            Your Doctor · आपके डॉक्टर
          </p>
          <p style={{ margin: "10px 0 2px", color: "#1f1d1a", fontSize: 18, fontWeight: 700 }}>
            {doctorName}
          </p>
          {doctorHospital && (
            <p style={{ margin: 0, color: "#77736b", fontSize: 13 }}>{doctorHospital}</p>
          )}
        </section>

        <section style={{ background: "#fff", border: "1px solid #e7e1d8", borderRadius: 8, padding: 16 }}>
          <p style={{ margin: 0, color: "#6f6a61", fontSize: 12, fontWeight: 700, textTransform: "uppercase" }}>
            Clinical Data · स्वास्थ्य जानकारी
          </p>
          <p style={{ margin: "10px 0 0", color: "#77736b", fontSize: 14 }}>
            No vitals, risk score, medication adherence, or trends have been recorded yet. · अभी कोई वाइटल, जोखिम स्कोर, दवा पालन या ट्रेंड दर्ज नहीं है।
          </p>
        </section>
      </div>

    </div>
  );
}

function PatientDashboardPageInner() {
  const { patient, loading } = usePatient();
  const [view, setView] = useState<View>("home");
  const [doctorNote, setDoctorNote] = useState<string | undefined>(undefined);
  const [nextAppointment, setNextAppointment] = useState<string | undefined>(undefined);
  const [homeRefreshKey, setHomeRefreshKey] = useState(0);

  useEffect(() => {
    if (!patient?.id) return;
    const supabase = createClient();
    supabase
      .from("doctor_instructions")
      .select("instruction_text")
      .eq("patient_id", patient.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single()
      .then(({ data }) => {
        if (data?.instruction_text) setDoctorNote(data.instruction_text);
      });

    // Fetch next appointment using Bearer token
    supabase.auth.getSession().then(({ data: sessionData }) => {
      const token = sessionData.session?.access_token;
      if (!token) return;
      fetch("/api/appointments/next", { headers: { Authorization: `Bearer ${token}` } })
        .then((r) => r.json())
        .then((body) => {
          if (body.appointment?.scheduled_at) {
            setNextAppointment(
              new Date(body.appointment.scheduled_at).toLocaleDateString("en-IN", {
                day: "numeric", month: "short", year: "numeric",
              })
            );
          }
        })
        .catch(() => { /* non-critical */ });
    });
  }, [patient?.id]);

  const homeData = usePatientHomeData(
    patient?.id ?? null,
    patient?.doctor_id ?? null,
    patient?.effective_dashboard ?? null,
    homeRefreshKey,
  );

  if (loading || !patient) return null;
  const currentPatient = patient;
  const activeDashboard = homeData.effectiveDashboard ?? currentPatient.effective_dashboard;

  const patientProps = {
    name: currentPatient.name,
    patientId: currentPatient.id,
    doctor: homeData.doctor,
    doctorHospital: homeData.loading
      ? ""
      : homeData.doctorHospital,
    nextAppointment: nextAppointment ?? PATIENT_PROFILE.nextAppointment,
    riskScore: homeData.loading ? PATIENT_PROFILE.riskScore : homeData.riskScore,
    spo2Today: homeData.loading ? PATIENT_PROFILE.spo2Today : homeData.spo2Today,
    mmrcToday: homeData.loading ? PATIENT_PROFILE.mmrcToday : homeData.mmrcToday,
    aqiToday: homeData.loading ? PATIENT_PROFILE.aqiToday : homeData.aqiToday,
    lastLogDate: homeData.loading ? null : homeData.lastLogDate,
    hasTodayLog: !homeData.loading && homeData.hasTodayLog,
    diagnosis: homeData.diagnosis,
    baselineSpo2: homeData.baselineSpo2,
    baselineHeartRate: homeData.baselineHeartRate,
    latestPft: homeData.latestPft,
  };

  const trendProps = {
    spo2Trend: homeData.spo2Trend.length > 0 ? homeData.spo2Trend : undefined,
    mmrcTrend: homeData.mmrcTrend.length > 0 ? homeData.mmrcTrend : undefined,
    vasTrend: homeData.vasTrend.length > 0 ? homeData.vasTrend : undefined,
    diseaseSpecificTrend:
      homeData.diseaseSpecificTrend.length > 0
        ? homeData.diseaseSpecificTrend
        : undefined,
  };

  const goLog = () => setView("log");

  function renderHome() {
    if (homeData.loading) {
      return (
        <NewPatientHome
          patientName={currentPatient.name}
          doctorName={homeData.doctor}
          doctorHospital={homeData.doctorHospital}
          onLogToday={goLog}
        />
      );
    }

    if (!homeData.lastLogDate) {
      return (
        <NewPatientHome
          patientName={currentPatient.name}
          doctorName={patientProps.doctor}
          doctorHospital={patientProps.doctorHospital}
          onLogToday={goLog}
          hasPreviousLogs={Boolean(homeData.lastLogDate)}
        />
      );
    }

    if (!homeData.hasTodayLog) {
      return (
        <NewPatientHome
          patientName={currentPatient.name}
          doctorName={patientProps.doctor}
          doctorHospital={patientProps.doctorHospital}
          onLogToday={goLog}
          hasPreviousLogs
        />
      );
    }

    switch (activeDashboard) {
      case "asthma":
        return (
          <AsthmaHomeView
            patient={patientProps}
            onLogToday={goLog}
            {...trendProps}
            doctorNote={doctorNote}
          />
        );
      case "copd":
        return (
          <COPDHomeView
            patient={patientProps}
            onLogToday={goLog}
            {...trendProps}
            doctorNote={doctorNote}
          />
        );
      case "bronchiectasis":
        return (
          <BronchHomeView
            patient={patientProps}
            onLogToday={goLog}
            spo2Trend={trendProps.spo2Trend}
            mmrcTrend={trendProps.mmrcTrend}
            vasTrend={trendProps.vasTrend}
            doctorNote={doctorNote}
          />
        );
      case "post_icu":
        return (
          <PostICUHomeView
            patient={patientProps}
            onLogToday={goLog}
            {...trendProps}
            doctorNote={doctorNote}
          />
        );
      case "ild":
        return (
          <ILDHomeView
            patient={patientProps}
            onLogToday={goLog}
            {...trendProps}
            doctorNote={doctorNote}
          />
        );
      default:
        return (
          <HomeView
            onLogToday={goLog}
            spo2Today={patientProps.spo2Today}
            mmrcToday={patientProps.mmrcToday}
            aqiToday={patientProps.aqiToday}
            riskScore={patientProps.riskScore}
            doctor={patientProps.doctor}
            doctorHospital={patientProps.doctorHospital}
            spo2Trend={trendProps.spo2Trend}
            doctorNote={doctorNote}
            lastLogDate={patientProps.lastLogDate}
          />
        );
    }
  }

  return (
    <div className={styles.shell}>
      <PatientTopNav activeView={view} onViewChange={setView} />
      <div className={styles.body}>
        <PatientSidebar activeView={view} onViewChange={setView} />
        <main className={styles.content}>
          {view === "home" && (
            <>
              {renderHome()}
            </>
          )}
          {view !== "home" && (
            <div className={styles.viewBackBar}>
              <button type="button" className={styles.backButton} onClick={() => setView("home")}>
                <ArrowLeft size={16} strokeWidth={1.8} />
                <span>Back</span>
              </button>
            </div>
          )}
          {view === "log" && <LogTodayView onLogSubmitted={() => setHomeRefreshKey((key) => key + 1)} />}
          {view === "analytics" && <PatientAnalyticsView patientId={currentPatient.id} />}
          {view === "appointments" && <BookAppointmentView />}
        </main>
      </div>
    </div>
  );
}

export default function PatientDashboardClient() {
  return (
    <PatientProvider>
      <PatientDashboardPageInner />
    </PatientProvider>
  );
}
