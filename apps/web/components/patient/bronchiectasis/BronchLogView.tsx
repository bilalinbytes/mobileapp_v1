"use client";

import { CommonDailyLogView } from "@/components/patient/CommonDailyLogView";

interface BronchLogViewProps {
  patientId: string;
  medicationMap: { id: string; name: string; dose: string; route: string; frequency: string }[];
}

export function BronchLogView({ patientId, medicationMap }: BronchLogViewProps) {
  return <CommonDailyLogView dashboard="bronchiectasis" patientId={patientId} medicationMap={medicationMap} />;
}
