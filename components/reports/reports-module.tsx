"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, RefreshCcw } from "lucide-react";
import { DEFAULT_STAFF_SHARE_PERCENT, EXPENSE_PAID_BY_LABELS } from "@/lib/constants/app";
import { createClient } from "@/lib/supabase/browser";
import { exportToExcel } from "@/lib/export/excel";
import { formatDate, formatMoney } from "@/lib/utils/format";
import type { ExpensePaidBy } from "@/lib/constants/app";
import type { OrderFinancialSummary, UserRole } from "@/lib/types/database";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

type BranchOption = { id: string; name: string };

type StaffProfile = {
  id: string;
  full_name: string;
  role: UserRole;
  branch_id: string | null;
  branches?: { name: string | null } | null;
};

type ReportCustomer = {
  id: string;
  branch_id: string | null;
  assigned_staff_id: string | null;
};

type ReportOrder = {
  id: string;
  order_code: string;
  branch_id: string | null;
  assigned_staff_id: string | null;
  service_type: string;
  status: string;
  payment_status: string;
  total_amount: number | string | null;
  paid_amount: number | string | null;
  debt_amount: number | string | null;
  order_date: string | null;
  branches?: { name: string | null } | null;
  assigned_staff?: { full_name: string | null } | null;
  financial_summary?: OrderFinancialSummary | null;
};

type ReportExpense = {
  id: string;
  order_id: string;
  branch_id: string | null;
  expense_type: string;
  amount: number | string | null;
  paid_by: ExpensePaidBy;
  paid_by_staff_id: string | null;
  expense_date: string | null;
  branches?: { name: string | null } | null;
  paid_by_staff?: { full_name: string | null } | null;
};

type ReportInvoice = {
  id: string;
  invoice_code: string;
  invoice_type: string;
  branch_id: string | null;
  amount: number | string | null;
  invoice_date: string | null;
  branches?: { name: string | null } | null;
};

type StaffPayoutRow = {
  staffId: string;
  staffName: string;
  branchName: string;
  completedOrderCount: number;
  paidAmount: number;
  totalExpenses: number;
  staffPaidExpenses: number;
  netProfit: number;
  staffProfitShare: number;
  staffTotalReceivable: number;
};

type DailySettlementReportRow = {
  id: string;
  settlement_code: string;
  branch_id: string | null;
  staff_id: string | null;
  settlement_date: string;
  total_required_amount: number | string | null;
  submitted_amount: number | string | null;
  remaining_amount: number | string | null;
  status: string;
  admin_note: string | null;
  confirmed_at: string | null;
  branches?: { name: string | null } | null;
  staff?: { full_name: string | null } | null;
  confirmer?: { full_name: string | null } | null;
};

type OwnerReportRow = {
  branchId: string;
  branchName: string;
  paidAmount: number;
  totalExpenses: number;
  storeOwnerPaidExpenses: number;
  netProfit: number;
  ownerProfitShare: number;
  ownerTotalReceivable: number;
};

function isDebtOrder(order: ReportOrder) {
  return Number(order.debt_amount ?? 0) > 0 || order.payment_status === "Còn nợ";
}

function groupMoney<T>(rows: T[], keyGetter: (row: T) => string, amountGetter: (row: T) => number) {
  const map = new Map<string, { name: string; count: number; amount: number }>();
  rows.forEach((row) => {
    const key = keyGetter(row) || "Chưa xác định";
    const current = map.get(key) ?? { name: key, count: 0, amount: 0 };
    current.count += 1;
    current.amount += amountGetter(row);
    map.set(key, current);
  });
  return [...map.values()];
}

function groupCount<T>(rows: T[], keyGetter: (row: T) => string) {
  const map = new Map<string, number>();
  rows.forEach((row) => {
    const key = keyGetter(row) || "Chưa xác định";
    map.set(key, (map.get(key) ?? 0) + 1);
  });
  return [...map.entries()].map(([name, count]) => ({ name, count }));
}

function financial(order: ReportOrder, key: keyof OrderFinancialSummary) {
  return Number(order.financial_summary?.[key] ?? 0);
}

function handoverStatus(order: ReportOrder) {
  return order.financial_summary?.handover_status ?? "Không cần nộp";
}

export function ReportsModule() {
  const supabase = useMemo(() => createClient(), []);
  const [orders, setOrders] = useState<ReportOrder[]>([]);
  const [invoices, setInvoices] = useState<ReportInvoice[]>([]);
  const [expenses, setExpenses] = useState<ReportExpense[]>([]);
  const [customers, setCustomers] = useState<ReportCustomer[]>([]);
  const [staff, setStaff] = useState<StaffProfile[]>([]);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [dailySettlements, setDailySettlements] = useState<DailySettlementReportRow[]>([]);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [branchFilter, setBranchFilter] = useState("");
  const [staffFilter, setStaffFilter] = useState("");
  const [settlementStatusFilter, setSettlementStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadData() {
    setLoading(true);
    setError("");
    const [ordersResult, summariesResult, invoicesResult, expensesResult, customersResult, staffResult, branchesResult, settlementsResult] = await Promise.all([
      supabase
        .from("orders")
        .select("id, order_code, branch_id, assigned_staff_id, service_type, status, payment_status, total_amount, paid_amount, debt_amount, order_date, branches(name), assigned_staff:profiles!orders_assigned_staff_id_fkey(full_name)")
        .order("order_date", { ascending: false }),
      supabase.from("order_financial_summary").select("*"),
      supabase
        .from("invoices")
        .select("id, invoice_code, invoice_type, branch_id, amount, invoice_date, branches(name)")
        .order("invoice_date", { ascending: false }),
      supabase
        .from("order_expenses")
        .select("id, order_id, branch_id, expense_type, amount, paid_by, paid_by_staff_id, expense_date, branches(name), paid_by_staff:profiles!order_expenses_paid_by_staff_id_fkey(full_name)")
        .order("expense_date", { ascending: false }),
      supabase.from("customers").select("id, branch_id, assigned_staff_id"),
      supabase.from("profiles").select("id, full_name, role, branch_id, branches(name)").eq("is_active", true).order("full_name"),
      supabase.from("branches").select("id, name").order("name"),
      supabase.from("daily_handover_settlements").select("id, settlement_code, branch_id, staff_id, settlement_date, total_required_amount, submitted_amount, remaining_amount, status, admin_note, confirmed_at, branches(name), staff:profiles!daily_handover_settlements_staff_id_fkey(full_name), confirmer:profiles!daily_handover_settlements_confirmed_by_fkey(full_name)").order("settlement_date", { ascending: false }),
    ]);
    setLoading(false);

    const summaryMissing = summariesResult.error?.message?.includes("order_financial_summary");
    const firstError =
      ordersResult.error ??
      (summaryMissing ? null : summariesResult.error) ??
      invoicesResult.error ??
      expensesResult.error ??
      customersResult.error ??
      staffResult.error ??
      branchesResult.error ??
      settlementsResult.error;
    if (firstError) {
      setError(firstError.message);
      return;
    }

    const summaryByOrderId = new Map(
      (((summaryMissing ? [] : summariesResult.data) ?? []) as unknown as OrderFinancialSummary[]).map((summary) => [summary.order_id, summary]),
    );

    setOrders(
      ((ordersResult.data ?? []) as unknown as ReportOrder[]).map((order) => ({
        ...order,
        financial_summary: summaryByOrderId.get(order.id) ?? null,
      })),
    );
    setInvoices((invoicesResult.data ?? []) as unknown as ReportInvoice[]);
    setExpenses((expensesResult.data ?? []) as unknown as ReportExpense[]);
    setCustomers((customersResult.data ?? []) as ReportCustomer[]);
    setStaff((staffResult.data ?? []) as unknown as StaffProfile[]);
    setBranches((branchesResult.data ?? []) as BranchOption[]);
    setDailySettlements((settlementsResult.data ?? []) as unknown as DailySettlementReportRow[]);
  }

  useEffect(() => {
    void loadData();
  }, []);

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const date = order.order_date ?? "";
      return (!fromDate || date >= fromDate) && (!toDate || date <= toDate) && (!branchFilter || order.branch_id === branchFilter);
    });
  }, [orders, fromDate, toDate, branchFilter]);

  const filteredInvoices = useMemo(() => {
    return invoices.filter((invoice) => {
      const date = invoice.invoice_date ?? "";
      return (!fromDate || date >= fromDate) && (!toDate || date <= toDate) && (!branchFilter || invoice.branch_id === branchFilter);
    });
  }, [invoices, fromDate, toDate, branchFilter]);

  const filteredExpenses = useMemo(() => {
    return expenses.filter((expense) => {
      const date = expense.expense_date ?? "";
      return (!fromDate || date >= fromDate) && (!toDate || date <= toDate) && (!branchFilter || expense.branch_id === branchFilter);
    });
  }, [expenses, fromDate, toDate, branchFilter]);

  const filteredCustomers = useMemo(() => {
    return customers.filter((customer) => !branchFilter || customer.branch_id === branchFilter);
  }, [customers, branchFilter]);

  const filteredDailySettlements = useMemo(() => {
    return dailySettlements.filter((settlement) => {
      const date = settlement.settlement_date ?? "";
      return (
        (!fromDate || date >= fromDate) &&
        (!toDate || date <= toDate) &&
        (!branchFilter || settlement.branch_id === branchFilter) &&
        (!staffFilter || settlement.staff_id === staffFilter) &&
        (!settlementStatusFilter || settlement.status === settlementStatusFilter)
      );
    });
  }, [dailySettlements, fromDate, toDate, branchFilter, staffFilter, settlementStatusFilter]);

  const branchNameById = useMemo(() => new Map(branches.map((branch) => [branch.id, branch.name])), [branches]);
  const staffNameById = useMemo(() => new Map(staff.map((profile) => [profile.id, profile.full_name])), [staff]);

  const revenue = filteredOrders.reduce((sum, order) => sum + Number(order.paid_amount ?? 0), 0);
  const totalDebt = filteredOrders.reduce((sum, order) => sum + Number(order.debt_amount ?? 0), 0);
  const debtOrderCount = filteredOrders.filter(isDebtOrder).length;
  const inputInvoiceTotal = filteredInvoices.filter((invoice) => invoice.invoice_type === "Đầu vào").reduce((sum, invoice) => sum + Number(invoice.amount ?? 0), 0);
  const outputInvoiceTotal = filteredInvoices.filter((invoice) => invoice.invoice_type === "Đầu ra").reduce((sum, invoice) => sum + Number(invoice.amount ?? 0), 0);
  const revenueByBranch = groupMoney(filteredOrders, (order) => order.branches?.name ?? "", (order) => Number(order.paid_amount ?? 0));
  const revenueByService = groupMoney(filteredOrders, (order) => order.service_type, (order) => Number(order.paid_amount ?? 0));
  const orderCountByStatus = groupCount(filteredOrders, (order) => order.status);

  const totalExpenses = filteredExpenses.reduce((sum, expense) => sum + Number(expense.amount ?? 0), 0);
  const staffPaidExpenses = filteredExpenses.filter((expense) => expense.paid_by === "staff").reduce((sum, expense) => sum + Number(expense.amount ?? 0), 0);
  const storeOwnerPaidExpenses = filteredExpenses.filter((expense) => expense.paid_by !== "staff").reduce((sum, expense) => sum + Number(expense.amount ?? 0), 0);
  const expensesByType = groupMoney(filteredExpenses, (expense) => expense.expense_type, (expense) => Number(expense.amount ?? 0));
  const expensesByBranch = groupMoney(filteredExpenses, (expense) => expense.branches?.name ?? "", (expense) => Number(expense.amount ?? 0));

  const staffPerformance = useMemo(() => {
    const staffMap = new Map<string, StaffPayoutRow>();

    staff
      .filter((profile) => !branchFilter || profile.branch_id === branchFilter)
      .forEach((profile) => {
        staffMap.set(profile.id, {
          staffId: profile.id,
          staffName: profile.full_name,
          branchName: profile.branches?.name ?? (profile.branch_id ? branchNameById.get(profile.branch_id) ?? "Chưa xác định" : "Không gán chi nhánh"),
          completedOrderCount: 0,
          paidAmount: 0,
          totalExpenses: 0,
          staffPaidExpenses: 0,
          netProfit: 0,
          staffProfitShare: 0,
          staffTotalReceivable: 0,
        });
      });

    filteredOrders.forEach((order) => {
      if (!order.assigned_staff_id) return;
      const current = staffMap.get(order.assigned_staff_id);
      if (!current) return;

      current.paidAmount += Number(order.paid_amount ?? 0);
      current.totalExpenses += financial(order, "total_expenses");
      current.staffPaidExpenses += financial(order, "staff_paid_expenses");
      current.netProfit += financial(order, "net_profit");
      current.staffProfitShare += financial(order, "staff_profit_share");
      current.staffTotalReceivable += financial(order, "staff_total_receivable");
      if (order.status === "Hoàn tất") current.completedOrderCount += 1;
    });

    return [...staffMap.values()].sort((a, b) => b.staffProfitShare - a.staffProfitShare || b.completedOrderCount - a.completedOrderCount);
  }, [staff, filteredOrders, branchFilter, branchNameById]);

  const staffCustomerCounts = useMemo(() => {
    const counts = new Map<string, number>();
    filteredCustomers.forEach((customer) => {
      if (!customer.assigned_staff_id) return;
      counts.set(customer.assigned_staff_id, (counts.get(customer.assigned_staff_id) ?? 0) + 1);
    });
    return counts;
  }, [filteredCustomers]);

  const ownerReport = useMemo<OwnerReportRow[]>(() => {
    const map = new Map<string, OwnerReportRow>();
    filteredOrders.forEach((order) => {
      const key = order.branch_id ?? "unknown";
      const current = map.get(key) ?? {
        branchId: key,
        branchName: order.branches?.name ?? (order.branch_id ? branchNameById.get(order.branch_id) ?? "Chưa xác định" : "Không gán chi nhánh"),
        paidAmount: 0,
        totalExpenses: 0,
        storeOwnerPaidExpenses: 0,
        netProfit: 0,
        ownerProfitShare: 0,
        ownerTotalReceivable: 0,
      };
      current.paidAmount += Number(order.paid_amount ?? 0);
      current.totalExpenses += financial(order, "total_expenses");
      current.storeOwnerPaidExpenses += financial(order, "store_paid_expenses") + financial(order, "owner_paid_expenses");
      current.netProfit += financial(order, "net_profit");
      current.ownerProfitShare += financial(order, "owner_profit_share");
      current.ownerTotalReceivable += financial(order, "owner_total_receivable");
      map.set(key, current);
    });
    return [...map.values()].sort((a, b) => b.ownerTotalReceivable - a.ownerTotalReceivable);
  }, [filteredOrders, branchNameById]);

  const revenueExportRows = filteredOrders.map((order) => ({
    "Ngày đơn": order.order_date ?? "",
    "Mã đơn": order.order_code,
    "Chi nhánh": order.branches?.name ?? "",
    "Dịch vụ": order.service_type,
    "Trạng thái đơn": order.status,
    "Trạng thái thanh toán": order.payment_status,
    "Tổng tiền": Number(order.total_amount ?? 0),
    "Đã thu": Number(order.paid_amount ?? 0),
    "Còn nợ": Number(order.debt_amount ?? 0),
    "Tổng chi phí": financial(order, "total_expenses"),
    "Lợi nhuận sau chi": financial(order, "net_profit"),
  }));

  const expenseExportRows = filteredExpenses.map((expense) => ({
    "Ngày chi": expense.expense_date ?? "",
    "Chi nhánh": expense.branches?.name ?? "",
    "Loại chi phí": expense.expense_type,
    "Số tiền": Number(expense.amount ?? 0),
    "Người ứng": EXPENSE_PAID_BY_LABELS[expense.paid_by],
    "Nhân viên ứng": expense.paid_by_staff?.full_name ?? "",
  }));

  const staffPayoutExportRows = staffPerformance.map((row) => ({
    "Nhân viên": row.staffName,
    "Chi nhánh": row.branchName,
    "Số khách phụ trách": staffCustomerCounts.get(row.staffId) ?? 0,
    "Số đơn hoàn tất": row.completedOrderCount,
    "Tiền đã thu": row.paidAmount,
    "Tổng chi phí đơn": row.totalExpenses,
    "Nhân viên đã ứng": row.staffPaidExpenses,
    "Lợi nhuận sau chi": row.netProfit,
    [`Phần lời nhân viên ${DEFAULT_STAFF_SHARE_PERCENT}%`]: row.staffProfitShare,
    "Tổng tiền nhân viên được nhận": row.staffTotalReceivable,
  }));

  const ownerExportRows = ownerReport.map((row) => ({
    "Chi nhánh": row.branchName,
    "Tiền đã thu": row.paidAmount,
    "Tổng chi phí": row.totalExpenses,
    "Cửa hàng/chủ đã ứng": row.storeOwnerPaidExpenses,
    "Lợi nhuận sau chi": row.netProfit,
    "Phần lời chủ 50%": row.ownerProfitShare,
    "Tổng tiền chủ/cửa hàng giữ": row.ownerTotalReceivable,
  }));

  const handoverRows = filteredOrders
    .filter((order) => financial(order, "handover_required_amount") > 0 || handoverStatus(order) !== "Không cần nộp")
    .map((order) => ({
      orderId: order.id,
      orderCode: order.order_code,
      staffName: order.assigned_staff?.full_name ?? (order.financial_summary?.collected_by_staff_id ? staffNameById.get(order.financial_summary.collected_by_staff_id) ?? "" : ""),
      branchName: order.branches?.name ?? "",
      paidAmount: Number(order.paid_amount ?? 0),
      totalExpenses: financial(order, "total_expenses"),
      staffPaidExpenses: financial(order, "staff_paid_expenses"),
      ownerFrontedExpenses: financial(order, "store_paid_expenses") + financial(order, "owner_paid_expenses"),
      netProfit: financial(order, "net_profit"),
      ownerProfitShare: financial(order, "owner_profit_share"),
      requiredAmount: financial(order, "handover_required_amount"),
      paidHandoverAmount: financial(order, "handover_paid_amount"),
      remainingAmount: financial(order, "handover_remaining_amount"),
      status: handoverStatus(order),
    }));

  const handoverExportRows = handoverRows.map((row) => ({
    "Mã đơn": row.orderCode,
    "Nhân viên": row.staffName,
    "Chi nhánh": row.branchName,
    "Khách đã trả": row.paidAmount,
    "Tổng chi phí": row.totalExpenses,
    "Nhân viên đã ứng": row.staffPaidExpenses,
    "Cửa hàng/chủ đã ứng": row.ownerFrontedExpenses,
    "Lợi nhuận sau chi": row.netProfit,
    "Chủ/cửa hàng hưởng 50%": row.ownerProfitShare,
    "Cửa hàng/chủ cần thu hồi vật tư": row.ownerFrontedExpenses,
    "Cần nộp chủ": row.requiredAmount,
    "Đã nộp chủ": row.paidHandoverAmount,
    "Còn phải nộp chủ": row.remainingAmount,
    "Trạng thái nộp tiền": row.status,
  }));

  const dailySettlementExportRows = filteredDailySettlements.map((settlement) => ({
    "Ngày nộp": settlement.settlement_date,
    "Mã phiếu": settlement.settlement_code,
    "Nhân viên": settlement.staff?.full_name ?? "",
    "Chi nhánh": settlement.branches?.name ?? "",
    "Tổng cần nộp": Number(settlement.total_required_amount ?? 0),
    "Đã gửi": Number(settlement.submitted_amount ?? 0),
    "Còn thiếu": Number(settlement.remaining_amount ?? 0),
    "Trạng thái": settlement.status,
    "Admin xác nhận": settlement.confirmer?.full_name ?? "",
    "Ghi chú": settlement.admin_note ?? "",
  }));

  async function exportRevenueReport() {
    await exportToExcel("bao-cao-doanh-thu", "Báo cáo doanh thu", [
      { header: "Ngày đơn", key: "Ngày đơn", width: 14 },
      { header: "Mã đơn", key: "Mã đơn", width: 16 },
      { header: "Chi nhánh", key: "Chi nhánh", width: 28 },
      { header: "Dịch vụ", key: "Dịch vụ", width: 22 },
      { header: "Trạng thái đơn", key: "Trạng thái đơn", width: 18 },
      { header: "Trạng thái thanh toán", key: "Trạng thái thanh toán", width: 22 },
      { header: "Tổng tiền", key: "Tổng tiền", money: true, width: 18 },
      { header: "Đã thu", key: "Đã thu", money: true, width: 18 },
      { header: "Còn nợ", key: "Còn nợ", money: true, width: 18 },
      { header: "Tổng chi phí", key: "Tổng chi phí", money: true, width: 18 },
      { header: "Lợi nhuận sau chi", key: "Lợi nhuận sau chi", money: true, width: 20 },
    ], revenueExportRows);
  }

  async function exportExpenseReport() {
    await exportToExcel("bao-cao-chi-phi", "Báo cáo chi phí", [
      { header: "Ngày chi", key: "Ngày chi", width: 14 },
      { header: "Chi nhánh", key: "Chi nhánh", width: 28 },
      { header: "Loại chi phí", key: "Loại chi phí", width: 24 },
      { header: "Số tiền", key: "Số tiền", money: true, width: 18 },
      { header: "Người ứng", key: "Người ứng", width: 18 },
      { header: "Nhân viên ứng", key: "Nhân viên ứng", width: 28 },
    ], expenseExportRows);
  }

  async function exportStaffPayoutReport() {
    await exportToExcel("bao-cao-an-chia-nhan-vien", "Ăn chia nhân viên", [
      { header: "Nhân viên", key: "Nhân viên", width: 28 },
      { header: "Chi nhánh", key: "Chi nhánh", width: 28 },
      { header: "Số khách phụ trách", key: "Số khách phụ trách", width: 20 },
      { header: "Số đơn hoàn tất", key: "Số đơn hoàn tất", width: 18 },
      { header: "Tiền đã thu", key: "Tiền đã thu", money: true, width: 18 },
      { header: "Tổng chi phí đơn", key: "Tổng chi phí đơn", money: true, width: 20 },
      { header: "Nhân viên đã ứng", key: "Nhân viên đã ứng", money: true, width: 20 },
      { header: "Lợi nhuận sau chi", key: "Lợi nhuận sau chi", money: true, width: 20 },
      { header: `Phần lời nhân viên ${DEFAULT_STAFF_SHARE_PERCENT}%`, key: `Phần lời nhân viên ${DEFAULT_STAFF_SHARE_PERCENT}%`, money: true, width: 24 },
      { header: "Tổng tiền nhân viên được nhận", key: "Tổng tiền nhân viên được nhận", money: true, width: 28 },
    ], staffPayoutExportRows);
  }

  async function exportOwnerReport() {
    await exportToExcel("bao-cao-phan-chu-cua-hang", "Phần chủ cửa hàng", [
      { header: "Chi nhánh", key: "Chi nhánh", width: 28 },
      { header: "Tiền đã thu", key: "Tiền đã thu", money: true, width: 18 },
      { header: "Tổng chi phí", key: "Tổng chi phí", money: true, width: 18 },
      { header: "Cửa hàng/chủ đã ứng", key: "Cửa hàng/chủ đã ứng", money: true, width: 22 },
      { header: "Lợi nhuận sau chi", key: "Lợi nhuận sau chi", money: true, width: 20 },
      { header: "Phần lời chủ 50%", key: "Phần lời chủ 50%", money: true, width: 20 },
      { header: "Tổng tiền chủ/cửa hàng giữ", key: "Tổng tiền chủ/cửa hàng giữ", money: true, width: 28 },
    ], ownerExportRows);
  }

  async function exportHandoverReport() {
    await exportToExcel("bao-cao-nop-tien", "Báo cáo nộp tiền", [
      { header: "Mã đơn", key: "Mã đơn", width: 16 },
      { header: "Nhân viên", key: "Nhân viên", width: 28 },
      { header: "Chi nhánh", key: "Chi nhánh", width: 28 },
      { header: "Khách đã trả", key: "Khách đã trả", money: true, width: 18 },
      { header: "Tổng chi phí", key: "Tổng chi phí", money: true, width: 18 },
      { header: "Nhân viên đã ứng", key: "Nhân viên đã ứng", money: true, width: 20 },
      { header: "Cửa hàng/chủ đã ứng", key: "Cửa hàng/chủ đã ứng", money: true, width: 24 },
      { header: "Lợi nhuận sau chi", key: "Lợi nhuận sau chi", money: true, width: 20 },
      { header: "Chủ/cửa hàng hưởng 50%", key: "Chủ/cửa hàng hưởng 50%", money: true, width: 24 },
      { header: "Cửa hàng/chủ cần thu hồi vật tư", key: "Cửa hàng/chủ cần thu hồi vật tư", money: true, width: 30 },
      { header: "Cần nộp chủ", key: "Cần nộp chủ", money: true, width: 18 },
      { header: "Đã nộp chủ", key: "Đã nộp chủ", money: true, width: 18 },
      { header: "Còn phải nộp chủ", key: "Còn phải nộp chủ", money: true, width: 22 },
      { header: "Trạng thái nộp tiền", key: "Trạng thái nộp tiền", width: 22 },
    ], handoverExportRows);
  }

  async function exportDailySettlementReport() {
    await exportToExcel("bao-cao-nop-tien-theo-ngay", "Nộp tiền theo ngày", [
      { header: "Ngày nộp", key: "Ngày nộp", width: 14 },
      { header: "Mã phiếu", key: "Mã phiếu", width: 18 },
      { header: "Nhân viên", key: "Nhân viên", width: 28 },
      { header: "Chi nhánh", key: "Chi nhánh", width: 28 },
      { header: "Tổng cần nộp", key: "Tổng cần nộp", money: true, width: 18 },
      { header: "Đã gửi", key: "Đã gửi", money: true, width: 18 },
      { header: "Còn thiếu", key: "Còn thiếu", money: true, width: 18 },
      { header: "Trạng thái", key: "Trạng thái", width: 22 },
      { header: "Admin xác nhận", key: "Admin xác nhận", width: 28 },
      { header: "Ghi chú", key: "Ghi chú", width: 32 },
    ], dailySettlementExportRows);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Báo cáo</h1>
          <p className="text-sm text-muted-foreground">Tổng hợp doanh thu, chi phí, công nợ và ăn chia nhân viên/chủ cửa hàng.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Input className="w-40" type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
          <Input className="w-40" type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
          <Select className="w-56" value={branchFilter} onChange={(event) => setBranchFilter(event.target.value)}>
            <option value="">Tất cả chi nhánh</option>
            {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </Select>
          <Select className="w-56" value={staffFilter} onChange={(event) => setStaffFilter(event.target.value)}>
            <option value="">Tất cả nhân viên</option>
            {staff.filter((profile) => profile.role === "field_staff").map((profile) => <option key={profile.id} value={profile.id}>{profile.full_name}</option>)}
          </Select>
          <Select className="w-56" value={settlementStatusFilter} onChange={(event) => setSettlementStatusFilter(event.target.value)}>
            <option value="">Tất cả trạng thái phiếu</option>
            {["Chờ admin xác nhận", "Đã xác nhận", "Cần kiểm tra lại", "Từ chối"].map((status) => <option key={status} value={status}>{status}</option>)}
          </Select>
          <Button className="bg-slate-900" onClick={() => void loadData()}>
            <RefreshCcw className="h-4 w-4" />
            Tải lại
          </Button>
          <Button disabled={revenueExportRows.length === 0} onClick={() => void exportRevenueReport()}>
            <Download className="h-4 w-4" />
            Xuất doanh thu
          </Button>
          <Button disabled={expenseExportRows.length === 0} onClick={() => void exportExpenseReport()}>
            <Download className="h-4 w-4" />
            Xuất chi phí
          </Button>
          <Button disabled={staffPayoutExportRows.length === 0} onClick={() => void exportStaffPayoutReport()}>
            <Download className="h-4 w-4" />
            Xuất ăn chia
          </Button>
          <Button disabled={ownerExportRows.length === 0} onClick={() => void exportOwnerReport()}>
            <Download className="h-4 w-4" />
            Xuất phần chủ
          </Button>
          <Button disabled={handoverExportRows.length === 0} onClick={() => void exportHandoverReport()}>
            <Download className="h-4 w-4" />
            Xuất nộp tiền
          </Button>
          <Button disabled={dailySettlementExportRows.length === 0} onClick={() => void exportDailySettlementReport()}>
            <Download className="h-4 w-4" />
            Xuất nộp tiền theo ngày
          </Button>
        </div>
      </div>

      {error ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card><div className="text-sm text-muted-foreground">Doanh thu đã thu</div><div className="mt-2 text-2xl font-semibold">{formatMoney(revenue)}</div></Card>
        <Card><div className="text-sm text-muted-foreground">Tổng chi phí</div><div className="mt-2 text-2xl font-semibold">{formatMoney(totalExpenses)}</div></Card>
        <Card><div className="text-sm text-muted-foreground">Tổng công nợ</div><div className="mt-2 text-2xl font-semibold">{formatMoney(totalDebt)}</div></Card>
        <Card><div className="text-sm text-muted-foreground">Hóa đơn đầu vào</div><div className="mt-2 text-2xl font-semibold">{formatMoney(inputInvoiceTotal)}</div></Card>
      </div>

      {loading ? (
        <Card className="py-10 text-center text-sm text-muted-foreground">Đang tải báo cáo...</Card>
      ) : filteredOrders.length === 0 ? (
        <Card className="py-10 text-center text-sm text-muted-foreground">Chưa có dữ liệu báo cáo trong khoảng lọc hiện tại</Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          <ReportTable title="Doanh thu theo chi nhánh" rows={revenueByBranch} valueLabel="Doanh thu" />
          <ReportTable title="Doanh thu theo loại dịch vụ" rows={revenueByService} valueLabel="Doanh thu" />
          <Card>
            <h2 className="mb-4 font-semibold">Số đơn theo trạng thái đơn</h2>
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-muted-foreground"><th className="py-3">Trạng thái đơn</th><th className="text-right">Số đơn</th></tr></thead>
              <tbody>{orderCountByStatus.map((row) => <tr key={row.name} className="border-b"><td className="py-3">{row.name}</td><td className="text-right">{row.count}</td></tr>)}</tbody>
            </table>
          </Card>
          <Card>
            <h2 className="mb-4 font-semibold">Tóm tắt công nợ</h2>
            <div className="space-y-3 text-sm">
              <p className="flex justify-between"><span>Tổng số đơn</span><strong>{filteredOrders.length}</strong></p>
              <p className="flex justify-between"><span>Đơn còn nợ</span><strong>{debtOrderCount}</strong></p>
              <p className="flex justify-between"><span>Tổng công nợ</span><strong>{formatMoney(totalDebt)}</strong></p>
              <p className="flex justify-between"><span>Hóa đơn đầu ra</span><strong>{formatMoney(outputInvoiceTotal)}</strong></p>
            </div>
          </Card>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <h2 className="mb-4 font-semibold">Báo cáo chi phí</h2>
          <div className="mb-4 grid gap-3 md:grid-cols-3">
            <SummaryItem label="Tổng chi phí" value={formatMoney(totalExpenses)} />
            <SummaryItem label="Chi phí nhân viên ứng" value={formatMoney(staffPaidExpenses)} />
            <SummaryItem label="Chi phí cửa hàng/chủ ứng" value={formatMoney(storeOwnerPaidExpenses)} />
          </div>
          <ReportTable title="Chi phí theo loại" rows={expensesByType} valueLabel="Chi phí" compact />
        </Card>
        <ReportTable title="Chi phí theo chi nhánh" rows={expensesByBranch} valueLabel="Chi phí" />
      </div>

      <Card>
        <h2 className="mb-4 font-semibold">Báo cáo ăn chia nhân viên</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-3">Nhân viên</th>
                <th>Chi nhánh</th>
                <th className="text-right">Số khách phụ trách</th>
                <th className="text-right">Số đơn hoàn tất</th>
                <th className="text-right">Tiền đã thu</th>
                <th className="text-right">Tổng chi phí đơn</th>
                <th className="text-right">Nhân viên đã ứng</th>
                <th className="text-right">Lợi nhuận sau chi</th>
                <th className="text-right">Phần lời nhân viên 50%</th>
                <th className="text-right">Tổng tiền nhân viên được nhận</th>
              </tr>
            </thead>
            <tbody>
              {staffPerformance.length === 0 ? (
                <tr><td className="py-8 text-center text-muted-foreground" colSpan={10}>Chưa có dữ liệu ăn chia nhân viên</td></tr>
              ) : staffPerformance.map((row) => (
                <tr key={row.staffId} className="border-b">
                  <td className="py-3 font-medium">{row.staffName}</td>
                  <td>{row.branchName}</td>
                  <td className="text-right">{staffCustomerCounts.get(row.staffId) ?? 0}</td>
                  <td className="text-right">{row.completedOrderCount}</td>
                  <td className="text-right">{formatMoney(row.paidAmount)}</td>
                  <td className="text-right">{formatMoney(row.totalExpenses)}</td>
                  <td className="text-right">{formatMoney(row.staffPaidExpenses)}</td>
                  <td className="text-right">{formatMoney(row.netProfit)}</td>
                  <td className="text-right">{formatMoney(row.staffProfitShare)}</td>
                  <td className="text-right">{formatMoney(row.staffTotalReceivable)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <h2 className="mb-4 font-semibold">Báo cáo phần chủ/cửa hàng</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-3">Chi nhánh</th>
                <th className="text-right">Tiền đã thu</th>
                <th className="text-right">Tổng chi phí</th>
                <th className="text-right">Cửa hàng/chủ đã ứng</th>
                <th className="text-right">Lợi nhuận sau chi</th>
                <th className="text-right">Phần lời chủ 50%</th>
                <th className="text-right">Tổng tiền chủ/cửa hàng giữ</th>
              </tr>
            </thead>
            <tbody>
              {ownerReport.length === 0 ? (
                <tr><td className="py-8 text-center text-muted-foreground" colSpan={7}>Chưa có dữ liệu phần chủ/cửa hàng</td></tr>
              ) : ownerReport.map((row) => (
                <tr key={row.branchId} className="border-b">
                  <td className="py-3 font-medium">{row.branchName}</td>
                  <td className="text-right">{formatMoney(row.paidAmount)}</td>
                  <td className="text-right">{formatMoney(row.totalExpenses)}</td>
                  <td className="text-right">{formatMoney(row.storeOwnerPaidExpenses)}</td>
                  <td className="text-right">{formatMoney(row.netProfit)}</td>
                  <td className="text-right">{formatMoney(row.ownerProfitShare)}</td>
                  <td className="text-right">{formatMoney(row.ownerTotalReceivable)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <h2 className="mb-4 font-semibold">Báo cáo nộp tiền</h2>
        <div className="mb-4 grid gap-3 md:grid-cols-3">
          <SummaryItem
            label="Tổng hợp tiền nhân viên đang giữ"
            value={formatMoney(handoverRows.reduce((sum, row) => sum + row.remainingAmount, 0))}
          />
          <SummaryItem
            label="Số đơn chưa nộp tiền"
            value={handoverRows.filter((row) => row.status === "Chưa nộp").length.toString()}
          />
          <SummaryItem
            label="Số đơn nộp một phần"
            value={handoverRows.filter((row) => row.status === "Nộp một phần").length.toString()}
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1420px] text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-3">Mã đơn</th>
                <th>Nhân viên</th>
                <th>Chi nhánh</th>
                <th className="text-right">Khách đã trả</th>
                <th className="text-right">Tổng chi phí</th>
                <th className="text-right">Cửa hàng/chủ đã ứng</th>
                <th className="text-right">Phần lời chủ 50%</th>
                <th className="text-right">Cần nộp chủ</th>
                <th className="text-right">Đã nộp chủ</th>
                <th className="text-right">Còn phải nộp chủ</th>
                <th>Trạng thái nộp tiền</th>
              </tr>
            </thead>
            <tbody>
              {handoverRows.length === 0 ? (
                <tr><td className="py-8 text-center text-muted-foreground" colSpan={11}>Chưa có dữ liệu nộp tiền</td></tr>
              ) : handoverRows.map((row) => (
                <tr key={row.orderId} className="border-b">
                  <td className="py-3 font-medium">{row.orderCode}</td>
                  <td>{row.staffName || "-"}</td>
                  <td>{row.branchName || "-"}</td>
                  <td className="text-right">{formatMoney(row.paidAmount)}</td>
                  <td className="text-right">{formatMoney(row.totalExpenses)}</td>
                  <td className="text-right">{formatMoney(row.ownerFrontedExpenses)}</td>
                  <td className="text-right">{formatMoney(row.ownerProfitShare)}</td>
                  <td className="text-right">{formatMoney(row.requiredAmount)}</td>
                  <td className="text-right">{formatMoney(row.paidHandoverAmount)}</td>
                  <td className="text-right">{formatMoney(row.remainingAmount)}</td>
                  <td>{row.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <h2 className="mb-4 font-semibold">Báo cáo nộp tiền theo ngày</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-3">Ngày nộp</th>
                <th>Mã phiếu</th>
                <th>Nhân viên</th>
                <th>Chi nhánh</th>
                <th className="text-right">Tổng cần nộp</th>
                <th className="text-right">Đã gửi</th>
                <th className="text-right">Còn thiếu</th>
                <th>Trạng thái</th>
                <th>Admin xác nhận</th>
                <th>Ghi chú</th>
              </tr>
            </thead>
            <tbody>
              {filteredDailySettlements.length === 0 ? (
                <tr><td className="py-8 text-center text-muted-foreground" colSpan={10}>Chưa có dữ liệu nộp tiền theo ngày</td></tr>
              ) : filteredDailySettlements.map((settlement) => (
                <tr key={settlement.id} className="border-b">
                  <td className="py-3">{formatDate(settlement.settlement_date)}</td>
                  <td className="font-medium">{settlement.settlement_code}</td>
                  <td>{settlement.staff?.full_name ?? "-"}</td>
                  <td>{settlement.branches?.name ?? "-"}</td>
                  <td className="text-right">{formatMoney(settlement.total_required_amount)}</td>
                  <td className="text-right">{formatMoney(settlement.submitted_amount)}</td>
                  <td className="text-right">{formatMoney(settlement.remaining_amount)}</td>
                  <td>{settlement.status}</td>
                  <td>{settlement.confirmer?.full_name ?? "-"}</td>
                  <td>{settlement.admin_note ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-white p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-semibold">{value}</div>
    </div>
  );
}

function ReportTable({
  title,
  rows,
  valueLabel,
  compact = false,
}: {
  title: string;
  rows: { name: string; count: number; amount: number }[];
  valueLabel: string;
  compact?: boolean;
}) {
  return (
    <Card>
      {!compact ? <h2 className="mb-4 font-semibold">{title}</h2> : <h3 className="mb-3 text-sm font-semibold">{title}</h3>}
      <table className="w-full text-sm">
        <thead><tr className="border-b text-left text-muted-foreground"><th className="py-3">Nhóm</th><th>Số dòng</th><th className="text-right">{valueLabel}</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.name} className="border-b"><td className="py-3">{row.name}</td><td>{row.count}</td><td className="text-right">{formatMoney(row.amount)}</td></tr>)}</tbody>
      </table>
    </Card>
  );
}
