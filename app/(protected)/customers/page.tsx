import { redirect } from "next/navigation";
import { CustomersModule } from "@/components/customers/customers-module";
import { isValidRole } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
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

  if (!profile?.is_active || !isValidRole(profile.role)) {
    redirect("/login?error=unassigned");
  }

  return <CustomersModule role={profile.role} branchId={profile.branch_id} userId={user.id} />;
}
