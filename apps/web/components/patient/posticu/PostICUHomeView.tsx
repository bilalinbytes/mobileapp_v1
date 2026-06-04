"use client";

import { Activity, HeartPulse } from "lucide-react";
import { DoctorNoteCard, YellowTipsCard } from "@/components/patient/shared";
import { CommonPatientDashboard } from "@/components/patient/CommonPatientDashboard";
import dStyles from "@/components/patient/disease.module.css";
import styles from "./PostICU.module.css";

const SPO2_TREND  = [88, 89, 90, 91, 90, 92, 91, 92, 93, 92, 93, 93, 93, 93];
const ENERGY_TREND = [2, 3, 3, 4, 4, 5, 5, 5, 6, 6, 6, 7, 7, 7];
const DAYS = ["27M","28T","29W","30T","31F","1S","2S","3M","4T","5W","6T","7F","8S","9S"];

interface Props {
  patient: {
    name: string; doctor: string; doctorHospital: string;
    nextAppointment: string; riskScore: number;
    spo2Today: number; mmrcToday: number; aqiToday: number;
    icuDischarge?: string; icuReason?: string;
    diagnosis?: string | null;
    baselineSpo2?: number | null;
    baselineHeartRate?: number | null;
    latestPft?: { fev1_fvc_ratio: number | null; fev1: number | null; fvc: number | null; dlco: number | null; test_date: string | null } | null;
    patientId?: string;
  };
  onLogToday: () => void;
  spo2Trend?: number[];
  mmrcTrend?: number[];
  vasTrend?: number[];
  diseaseSpecificTrend?: number[];
  doctorNote?: string;
}

export function PostICUHomeView({ patient, onLogToday, spo2Trend, mmrcTrend, vasTrend, doctorNote }: Props) {
  const daysSinceDischarge = patient.icuDischarge
    ? Math.floor((new Date().getTime() - new Date(patient.icuDischarge).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  return (
    <div className={dStyles.view}>
      <div className={dStyles.body}>
        {doctorNote && <DoctorNoteCard note={doctorNote} />}

        <CommonPatientDashboard
          name={patient.name}
          diagnosis={patient.diagnosis ?? null}
          patientId={patient.patientId ?? ""}
          spo2Today={patient.spo2Today}
          mmrcToday={patient.mmrcToday}
          aqiToday={patient.aqiToday}
          riskScore={patient.riskScore}
          doctor={patient.doctor}
          doctorHospital={patient.doctorHospital}
          nextAppointment={patient.nextAppointment}
          spo2Trend={spo2Trend}
          mmrcTrend={mmrcTrend}
          vasTrend={vasTrend}
          latestPft={patient.latestPft}
          onLogToday={onLogToday}
          accentColor="#1565c0"
          diseaseLabel="Post-ICU Recovery Dashboard"
        />

        <div className={styles.baselineGrid}>
          {[
            {
              label: "Baseline Saturation",
              value: patient.baselineSpo2 !== null && patient.baselineSpo2 !== undefined ? `${patient.baselineSpo2}%` : "Not recorded",
              sub: patient.baselineSpo2 !== null && patient.baselineSpo2 !== undefined
                ? patient.baselineSpo2 >= 94 ? "Recovery oxygen target" : "Monitor against daily SpO2"
                : "Doctor baseline pending",
              icon: Activity,
              color: patient.baselineSpo2 !== null && patient.baselineSpo2 !== undefined && patient.baselineSpo2 < 92 ? "#c94d49" : "#1565c0",
            },
            {
              label: "Baseline Heart Rate",
              value: patient.baselineHeartRate !== null && patient.baselineHeartRate !== undefined ? `${patient.baselineHeartRate} bpm` : "Not recorded",
              sub: "Doctor baseline pending",
              icon: HeartPulse,
              color: "#d85a30",
            },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} className={styles.baselineCard}>
                <div className={styles.baselineIcon} style={{ background: `${item.color}18`, color: item.color }}>
                  <Icon size={18} strokeWidth={1.8} />
                </div>
                <div>
                  <p className={styles.baselineLabel}>{item.label}</p>
                  <p className={styles.baselineValue} style={{ color: item.color }}>{item.value}</p>
                  <p className={styles.baselineSub}>{item.sub}</p>
                </div>
              </div>
            );
          })}
        </div>

        {patient.riskScore >= 4 && patient.riskScore < 7 && <YellowTipsCard disease="post_icu" />}

        {/* Recovery milestone banner */}
        <div className={styles.milestoneBanner}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>ICU</span>
          <div>
            <p className={styles.milestoneTitle}>
              {daysSinceDischarge !== null ? `Day ${daysSinceDischarge} of Recovery` : "Post-ICU Recovery"}
            </p>
            <p className={styles.milestoneSub}>
              {patient.icuDischarge ? `Discharged ${patient.icuDischarge}` : "Discharge date not recorded"}
              {patient.icuReason ? ` · ${patient.icuReason}` : ""}
            </p>
          </div>
          <div className={styles.milestoneProgress}>
            <div className={styles.milestoneBar}>
              <div
                className={styles.milestoneBarFill}
                style={{ width: daysSinceDischarge !== null ? `${Math.min((daysSinceDischarge / 90) * 100, 100)}%` : "0%" }}
              />
            </div>
            <p className={styles.milestoneBarLbl}>
              {daysSinceDischarge !== null ? `${daysSinceDischarge}/90 days target` : "—/90 days target"}
            </p>
          </div>
        </div>

        <div className={styles.grid}>
          {/* Recovery checklist */}
          <div className={dStyles.card}>
            <p className={dStyles.cardTitle}>Recovery Milestones</p>
            <p className={dStyles.cardSub}>Post-ICU rehabilitation progress</p>
            <div className={styles.milestoneList}>
              {[
                { label: "SpO₂ stable > 94% for 7 days", done: false },
                { label: "Walking 100m without stopping", done: true },
                { label: "No supplemental oxygen needed", done: false },
                { label: "Sleep quality improved", done: true },
                { label: "Returned to light daily activities", done: true },
                { label: "Pulmonary rehab session completed", done: false },
              ].map(item => (
                <div key={item.label} className={`${styles.milestoneItem} ${item.done ? styles.milestoneItemDone : ""}`}>
                  <div className={`${styles.milestoneCheck} ${item.done ? styles.milestoneCheckDone : ""}`}>
                    {item.done && "Done"}
                  </div>
                  <span className={styles.milestoneLabel}>{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
