import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PatientDashboardClient from "./PatientDashboardClient";

export default async function PatientDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/patient/login");
  }

  const { data: patientRow } = await supabase
    .from("patients")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (!patientRow) {
    redirect("/patient/login");
  }

  return <PatientDashboardClient />;
}
