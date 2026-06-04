"use client";

import { CommonDailyLogView } from "@/components/patient/CommonDailyLogView";

interface PostICULogViewProps {
  patientId: string;
  medicationMap: { id: string; name: string; dose: string; route: string; frequency: string }[];
}

export function PostICULogView({ patientId, medicationMap }: PostICULogViewProps) {
  return <CommonDailyLogView dashboard="post_icu" patientId={patientId} medicationMap={medicationMap} />;
}
