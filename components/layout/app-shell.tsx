import Link from "next/link";
import type { Route } from "next";
import { redirect } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { Building2, FileBarChart, FileText, HandCoins, Home, LogOut, Receipt, Settings, Users, WalletCards, Wrench } from "lucide-react";
import { canAccessPath, isValidRole } from "@/lib/auth/roles";
import { ROLE_LABELS } from "@/lib/constants/app";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { MobileNav } from "@/components/layout/mobile-nav";

const navItems: { href: Route; label: string; icon: LucideIcon }[] = [
  { href: "/dashboard", label: "Tổng quan", icon: Home },
  { href: "/branches", label: "Chi nhánh", icon: Building2 },
  { href: "/users", label: "Người dùng", icon: Users },
  { href: "/customers", label: "Khách hàng", icon: Users },
  { href: "/orders", label: "Đơn hàng", icon: Wrench },
  { href: "/daily-handover", label: "Nộp tiền trong ngày", icon: HandCoins },
  { href: "/invoices", label: "Hóa đơn", icon: Receipt },
  { href: "/debts", label: "Công nợ", icon: WalletCards },
  { href: "/reports", label: "Báo cáo", icon: FileBarChart },
  { href: "/settings", label: "Cài đặt", icon: Settings },
];

export async function AppShell({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.is_active || !isValidRole(profile.role)) {
    redirect("/login?error=unassigned");
  }

  const visibleNavItems = navItems.filter((item) => canAccessPath(profile.role, item.href));

  async function signOut() {
    "use server";
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r bg-white lg:block">
        <div className="flex h-16 items-center gap-2 border-b px-5">
          <FileText className="h-6 w-6 text-primary" />
          <div>
            <div className="font-semibold">TP Order CRM</div>
            <div className="text-xs text-muted-foreground">Tin Học Tấn Phát</div>
          </div>
        </div>
        <nav className="space-y-1 p-3">
          {visibleNavItems.map((item) => (
            <Link key={item.href} href={item.href} className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-muted">
              <item.icon className="h-4 w-4" />
              {profile.role === "field_staff" && item.href === "/daily-handover" ? "Nộp tiền của tôi" : item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="lg:pl-64">
        <MobileNav role={profile.role} fullName={profile.full_name ?? null} email={user.email} />
        <header className="sticky top-0 z-20 hidden h-16 items-center justify-between border-b bg-white px-4 lg:flex lg:px-6">
          <div className="font-semibold">TP Order CRM</div>
          <div className="ml-auto flex items-center gap-3">
            {profile.role === "admin" ? <NotificationBell /> : null}
            <div className="hidden text-right sm:block">
              <div className="text-sm font-medium">{profile.full_name ?? user.email}</div>
              <div className="text-xs text-muted-foreground">{ROLE_LABELS[profile.role]}</div>
            </div>
            <form action={signOut}>
              <Button className="h-9 bg-slate-900 px-3" title="Đăng xuất">
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Đăng xuất</span>
              </Button>
            </form>
          </div>
        </header>
        <main className="max-w-full overflow-x-hidden p-3 sm:p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
