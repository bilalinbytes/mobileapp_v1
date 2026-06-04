export interface DailyLog {
  date: string;
  spo2Rest: number;
  spo2Exertion: number;
  mmrc: number;
  vas: number;
  aqi: number;
  medicationsTaken: string[];
  medicationsMissed: string[];
  notes?: string;
}

export interface Medication {
  id: string;
  name: string;
  dose: string;
  frequency: string;
  route: string;
  takenToday: boolean;
  takenTimes?: string[];
}

export interface PatientProfile {
  id: string;
  name: string;
  initials: string;
  age: number;
  gender: "M" | "F";
  diagnosis: string;
  diagnosisLabel: string;
  condition: string;
  doctor: string;
  doctorHospital: string;
  riskScore: number;
  riskLevel: "critical" | "high" | "moderate" | "stable";
  spo2Today: number;
  mmrcToday: number;
  aqiToday: number;
  breathingStatus: string;
  oxygenStatus: string;
  supportNote: string;
  lastLog: string;
  nextAppointment: string;
}

export const PATIENT_PROFILE: PatientProfile = {
  id: "PKR001",
  name: "Priya Krishnamurthy",
  initials: "PK",
  age: 52,
  gender: "F",
  diagnosis: "ILD",
  diagnosisLabel: "ILD / CTD-ILD (RA) / Fibrotic",
  condition: "Fibrotic ILD · CTD-ILD (RA)",
  doctor: "Dr. R. Prasad",
  doctorHospital: "AIIMS, New Delhi",
  riskScore: 9,
  riskLevel: "critical",
  spo2Today: 84,
  mmrcToday: 3,
  aqiToday: 142,
  breathingStatus: "Severe breathlessness",
  oxygenStatus: "Critically low — 84%",
  supportNote: "On LTOT 2.5 L/min · BiPAP overnight",
  lastLog: "Today 14:22",
  nextAppointment: "15 April 2026",
};

export const MEDICATIONS: Medication[] = [
  { id: "m1", name: "Pirfenidone", dose: "801 mg", frequency: "TDS", route: "Tablet", takenToday: false },
  { id: "m2", name: "Methotrexate", dose: "15 mg", frequency: "Weekly", route: "Injection", takenToday: true, takenTimes: ["08:00"] },
  { id: "m3", name: "Prednisolone", dose: "10 mg", frequency: "OD", route: "Tablet", takenToday: true, takenTimes: ["07:30"] },
  { id: "m4", name: "Pantoprazole", dose: "40 mg", frequency: "OD", route: "Tablet", takenToday: false },
];

export const SPO2_TREND = [89, 88, 90, 87, 88, 86, 87, 85, 86, 84, 85, 84, 84, 84];
export const MMRC_TREND  = [2, 2, 2, 2, 3, 2, 3, 3, 3, 3, 3, 3, 3, 3];
export const VAS_TREND   = [4, 5, 4, 5, 6, 5, 6, 7, 7, 8, 8, 8, 8, 9];
export const DAYS_14     = ["27M","28T","29W","30T","31F","1S","2S","3M","4T","5W","6T","7F","8S","9S"];

export const RECENT_LOGS: DailyLog[] = [
  {
    date: "Today, 9 Apr",
    spo2Rest: 84, spo2Exertion: 78, mmrc: 3, vas: 8.5, aqi: 142,
    medicationsTaken: ["Methotrexate", "Prednisolone"],
    medicationsMissed: ["Pirfenidone", "Pantoprazole"],
    notes: "Felt very breathless after walking to bathroom. Used oxygen all day.",
  },
  {
    date: "Yesterday, 8 Apr",
    spo2Rest: 85, spo2Exertion: 80, mmrc: 3, vas: 8, aqi: 138,
    medicationsTaken: ["Pirfenidone", "Methotrexate", "Prednisolone", "Pantoprazole"],
    medicationsMissed: [],
  },
  {
    date: "7 Apr",
    spo2Rest: 86, spo2Exertion: 81, mmrc: 3, vas: 7, aqi: 120,
    medicationsTaken: ["Pirfenidone", "Prednisolone", "Pantoprazole"],
    medicationsMissed: ["Methotrexate"],
  },
];
