import { redirect } from "next/navigation";
import { UsersModule } from "@/components/users/users-module";
import { isValidRole } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";

export default async function UsersPage() {
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
  if (profile.role === "field_staff") redirect("/dashboard");

  return <UsersModule currentRole={profile.role} currentBranchId={profile.branch_id} />;
}
