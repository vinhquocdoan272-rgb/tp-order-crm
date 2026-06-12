import { redirect } from "next/navigation";
import { DebtsModule } from "@/components/debts/debts-module";
import { isValidRole } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function DebtsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.is_active || !isValidRole(profile.role)) {
    redirect("/login?error=unassigned");
  }

  if (profile.role === "field_staff") {
    redirect("/dashboard?error=unauthorized");
  }

  return <DebtsModule role={profile.role} />;
}
