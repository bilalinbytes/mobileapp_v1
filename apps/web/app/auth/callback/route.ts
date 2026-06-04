import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.exchangeCodeForSession(code);

    if (error || !user) {
      return NextResponse.redirect(`${origin}/login?error=auth_failed`);
    }

    const { data: existingDoctor } = await supabase
      .from("doctors")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();

    if (existingDoctor) {
      return NextResponse.redirect(`${origin}/doctordashboard`);
    }

    return NextResponse.redirect(`${origin}/complete-profile`);
  }

  return NextResponse.redirect(`${origin}/login?error=no_code`);
}
