import { redirect } from "next/navigation";
import { DailyHandoverModule } from "@/components/daily-handover/daily-handover-module";
import { isValidRole } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function DailyHandoverPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, branch_id, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.is_active || !isValidRole(profile.role)) redirect("/login?error=unassigned");

  return <DailyHandoverModule role={profile.role} userId={user.id} branchId={profile.branch_id} />;
}
