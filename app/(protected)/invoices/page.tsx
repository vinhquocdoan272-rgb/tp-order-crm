import { redirect } from "next/navigation";
import { InvoicesModule } from "@/components/invoices/invoices-module";
import { isValidRole } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function InvoicesPage() {
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

  if (profile.role === "field_staff") {
    redirect("/dashboard?error=unauthorized");
  }

  return <InvoicesModule role={profile.role} branchId={profile.branch_id} />;
}
