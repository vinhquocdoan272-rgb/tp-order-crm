import type { UserRole } from "@/lib/types/database";

export type CurrentUserScope = {
  id: string;
  role: UserRole;
  branch_id: string | null;
};

export type OrderScope = {
  branch_id: string | null;
  assigned_staff_id: string | null;
  created_by?: string | null;
};

export function canViewOrder(role: UserRole, order: OrderScope, currentUser: CurrentUserScope) {
  if (role === "admin") return true;
  if (role === "branch_manager") return Boolean(order.branch_id && order.branch_id === currentUser.branch_id);
  return order.assigned_staff_id === currentUser.id || order.created_by === currentUser.id;
}

export function canEditOrder(role: UserRole, order: OrderScope, currentUser: CurrentUserScope) {
  return canViewOrder(role, order, currentUser);
}

export function canDeleteOrder(role: UserRole) {
  return role === "admin";
}

export function canViewProfitSharing(role: UserRole, order: OrderScope, currentUser: CurrentUserScope) {
  return canViewOrder(role, order, currentUser);
}

export function canManageInvoices(role: UserRole) {
  return role === "admin";
}

export function canCreateInvoice(role: UserRole, invoiceBranchId: string | null, currentUser: CurrentUserScope) {
  if (role === "admin") return true;
  return role === "branch_manager" && Boolean(invoiceBranchId && invoiceBranchId === currentUser.branch_id);
}

export function canEditInvoice(role: UserRole) {
  return role === "admin";
}

export function canDeleteInvoice(role: UserRole) {
  return role === "admin";
}

export function canViewFullReports(role: UserRole) {
  return role === "admin" || role === "branch_manager";
}

export function canViewSensitiveFinancials(role: UserRole, order: OrderScope | null, currentUser: CurrentUserScope) {
  if (role === "admin") return true;
  if (role === "branch_manager") return Boolean(order?.branch_id && order.branch_id === currentUser.branch_id);
  return Boolean((order?.assigned_staff_id && order.assigned_staff_id === currentUser.id) || order?.created_by === currentUser.id);
}
