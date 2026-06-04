"use client";

import { CommonDailyLogView } from "@/components/patient/CommonDailyLogView";

interface ILDLogViewProps {
  patientId: string;
  medicationMap: { id: string; name: string; dose: string; route: string; frequency: string }[];
  onSuccess?: () => void;
}

export function ILDLogView({ patientId, medicationMap, onSuccess }: ILDLogViewProps) {
  return <CommonDailyLogView dashboard="ild" patientId={patientId} medicationMap={medicationMap} onSuccess={onSuccess} />;
}
