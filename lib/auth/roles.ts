import type { UserRole } from "@/lib/types/database";

export const UNASSIGNED_ACCOUNT_MESSAGE = "Tài khoản chưa được phân quyền. Vui lòng liên hệ quản trị viên.";

export function getRoleHomePath(role: UserRole) {
  if (role === "field_staff") return "/orders";
  return "/dashboard";
}

export function canAccessPath(role: UserRole, pathname: string) {
  if (role === "admin") return true;

  if (role === "branch_manager") {
    return [
      "/dashboard",
      "/users",
      "/customers",
      "/orders",
      "/daily-handover",
      "/invoices",
      "/debts",
      "/reports",
      "/settings",
    ].some((path) => pathname === path || pathname.startsWith(`${path}/`));
  }

  return ["/dashboard", "/customers", "/orders", "/daily-handover"].some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export function isValidRole(role: string | null | undefined): role is UserRole {
  return role === "admin" || role === "branch_manager" || role === "field_staff";
}
