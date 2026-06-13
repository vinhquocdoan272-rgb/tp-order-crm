"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Building2, FileBarChart, FileText, HandCoins, Home, LogOut, Menu, Receipt, Settings, Users, WalletCards, Wrench, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { canAccessPath } from "@/lib/auth/roles";
import { ROLE_LABELS } from "@/lib/constants/app";
import { createClient } from "@/lib/supabase/browser";
import type { UserRole } from "@/lib/types/database";

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

function mobileLabel(role: UserRole, href: Route, label: string) {
  if (role === "field_staff" && href === "/daily-handover") return "Nộp tiền của tôi";
  return label;
}

function pageTitle(pathname: string, role: UserRole) {
  const current = navItems
    .slice()
    .sort((a, b) => b.href.length - a.href.length)
    .find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
  return current ? mobileLabel(role, current.href, current.label) : "TP Order CRM";
}

export function MobileNav({ role, fullName, email }: { role: UserRole; fullName: string | null; email: string | null | undefined }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const visibleItems = navItems.filter((item) => canAccessPath(role, item.href));

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-white px-3 lg:hidden">
        <button type="button" className="inline-flex h-10 w-10 items-center justify-center rounded-md border text-slate-700" onClick={() => setOpen(true)} aria-label="Mở menu">
          <Menu className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1 px-3">
          <div className="truncate text-sm font-semibold">TP Order CRM</div>
          <div className="truncate text-xs text-muted-foreground">{pageTitle(pathname, role)}</div>
        </div>
        <FileText className="h-5 w-5 shrink-0 text-primary" />
      </header>

      {open ? <button type="button" className="fixed inset-0 z-40 bg-slate-950/50 lg:hidden" aria-label="Đóng menu" onClick={() => setOpen(false)} /> : null}

      <aside className={`fixed inset-y-0 left-0 z-50 w-[84vw] max-w-xs transform bg-white shadow-xl transition-transform lg:hidden ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex h-16 items-center justify-between border-b px-4">
          <div className="min-w-0">
            <div className="font-semibold">TP Order CRM</div>
            <div className="truncate text-xs text-muted-foreground">Tin Học Tấn Phát</div>
          </div>
          <button type="button" className="inline-flex h-9 w-9 items-center justify-center rounded-md border" onClick={() => setOpen(false)} aria-label="Đóng menu">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b px-4 py-3">
          <div className="truncate text-sm font-medium">{fullName ?? email ?? "Người dùng"}</div>
          <div className="text-xs text-muted-foreground">{ROLE_LABELS[role]}</div>
        </div>

        <nav className="space-y-1 p-3">
          {visibleItems.map((item) => (
            <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-md px-3 py-3 text-sm text-slate-700 hover:bg-muted">
              <item.icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{mobileLabel(role, item.href, item.label)}</span>
            </Link>
          ))}
        </nav>

        <div className="absolute inset-x-0 bottom-0 border-t p-3">
          <button type="button" className="flex w-full items-center justify-center gap-2 rounded-md bg-slate-900 px-4 py-3 text-sm font-medium text-white" onClick={() => void signOut()}>
            <LogOut className="h-4 w-4" />
            Đăng xuất
          </button>
        </div>
      </aside>
    </>
  );
}
