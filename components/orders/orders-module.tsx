"use client";

import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Download, Eye, RefreshCcw, Save, Search } from "lucide-react";
import type { OrderFinancialSummary, UserRole } from "@/lib/types/database";
import { COLLECTION_METHODS, COLLECTED_BY_LABELS, COLLECTED_BY_OPTIONS, CUSTOMER_TYPES, ORDER_STATUSES, PAYMENT_STATUSES, ROLE_LABELS, SERVICE_TYPES } from "@/lib/constants/app";
import { customerSchema, orderSchema } from "@/lib/validations/schemas";
import { exportToExcel } from "@/lib/export/excel";
import { createAdminNotification, writeAuditLog } from "@/lib/notifications/admin-notifications";
import { createClient } from "@/lib/supabase/browser";
import { formatMoney } from "@/lib/utils/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CancelOrderButton, DeleteOrderButton } from "@/components/orders/order-admin-actions";

type BranchOption = { id: string; name: string };
type CustomerOption = { id: string; customer_code: string; name: string; phone: string; branch_id: string | null; assigned_staff_id: string | null };
type StaffOption = { id: string; full_name: string; role: UserRole; branch_id: string | null };

type OrderRow = {
  id: string;
  order_code: string;
  customer_id: string | null;
  branch_id: string | null;
  assigned_staff_id: string | null;
  created_by: string | null;
  service_type: string;
  status: string;
  payment_status: string;
  request_description: string | null;
  technical_note: string | null;
  total_amount: number | string | null;
  paid_amount: number | string | null;
  debt_amount: number | string | null;
  collected_by_type: "staff" | "store" | "owner" | "company_bank";
  collected_by_staff_id: string | null;
  collection_method: string;
  handover_status: string;
  handover_required_amount: number | string | null;
  handover_paid_amount: number | string | null;
  handover_remaining_amount: number | string | null;
  order_date: string | null;
  created_at: string;
  customers?: { name: string | null; phone: string | null; customer_code: string | null } | null;
  branches?: { name: string | null } | null;
  assigned_staff?: { full_name: string | null } | null;
  financial_summary?: OrderFinancialSummary | null;
};

type FormState = {
  customer_id: string;
  branch_id: string;
  assigned_staff_id: string;
  service_type: string;
  status: string;
  payment_status: string;
  request_description: string;
  technical_note: string;
  total_amount: string;
  paid_amount: string;
  collected_by_type: "staff" | "store" | "owner" | "company_bank";
  collected_by_staff_id: string;
  collection_method: string;
  order_date: string;
};

type QuickCustomerForm = {
  name: string;
  phone: string;
  address: string;
  customer_type: string;
  note: string;
};

const today = new Date().toISOString().slice(0, 10);
const initialForm: FormState = {
  customer_id: "",
  branch_id: "",
  assigned_staff_id: "",
  service_type: "",
  status: "Mới tạo",
  payment_status: "Chưa thu",
  request_description: "",
  technical_note: "",
  total_amount: "0",
  paid_amount: "0",
  collected_by_type: "store",
  collected_by_staff_id: "",
  collection_method: "Tiền mặt",
  order_date: today,
};

const initialQuickCustomer: QuickCustomerForm = {
  name: "",
  phone: "",
  address: "",
  customer_type: "Cá nhân",
  note: "",
};

function staffLabel(staff: StaffOption) {
  return `${staff.full_name} - ${ROLE_LABELS[staff.role]}`;
}

function financialValue(order: OrderRow, key: keyof OrderFinancialSummary) {
  if (order.financial_summary?.[key] != null) return Number(order.financial_summary[key] ?? 0);
  if (key === "handover_required_amount") return Number(order.handover_required_amount ?? 0);
  if (key === "handover_paid_amount") return Number(order.handover_paid_amount ?? 0);
  if (key === "handover_remaining_amount") return Number(order.handover_remaining_amount ?? 0);
  return 0;
}

function handoverStatus(order: OrderRow) {
  return order.financial_summary?.handover_status ?? order.handover_status ?? "Không cần nộp";
}

export function OrdersModule({ role, branchId, userId }: { role: UserRole; branchId: string | null; userId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const canManage = role === "admin" || role === "branch_manager";
  const isFieldStaff = role === "field_staff";
  const canUseBranchFilter = role === "admin";
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [form, setForm] = useState<FormState>({
    ...initialForm,
    branch_id: role === "branch_manager" || role === "field_staff" ? branchId ?? "" : "",
    assigned_staff_id: role === "field_staff" ? userId : "",
    collected_by_type: role === "field_staff" ? "staff" : initialForm.collected_by_type,
    collected_by_staff_id: role === "field_staff" ? userId : "",
  });
  const [showQuickCustomer, setShowQuickCustomer] = useState(false);
  const [quickCustomer, setQuickCustomer] = useState<QuickCustomerForm>(initialQuickCustomer);
  const [quickCustomerSaving, setQuickCustomerSaving] = useState(false);
  const [editing, setEditing] = useState<OrderRow | null>(null);
  const [query, setQuery] = useState("");
  const [branchFilter, setBranchFilter] = useState(role === "branch_manager" ? branchId ?? "" : "");
  const [statusFilter, setStatusFilter] = useState("");
  const [serviceFilter, setServiceFilter] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function loadData() {
    setLoading(true);
    setError("");

    const [ordersResult, branchesResult, customersResult, staffResult, summaryResult] = await Promise.all([
      supabase
        .from("orders")
        .select("id, order_code, customer_id, branch_id, assigned_staff_id, created_by, service_type, status, payment_status, request_description, technical_note, total_amount, paid_amount, debt_amount, collected_by_type, collected_by_staff_id, collection_method, handover_status, handover_required_amount, handover_paid_amount, handover_remaining_amount, order_date, created_at, customers(name, phone, customer_code), branches(name), assigned_staff:profiles!orders_assigned_staff_id_fkey(full_name)")
        .order("created_at", { ascending: false }),
      supabase.from("branches").select("id, name").order("name"),
      supabase.from("customers").select("id, customer_code, name, phone, branch_id, assigned_staff_id").order("name"),
      supabase.from("profiles").select("id, full_name, role, branch_id").eq("is_active", true).order("full_name"),
      supabase.from("order_financial_summary").select("*"),
    ]);

    setLoading(false);

    const summaryMissing = summaryResult.error?.message?.includes("order_financial_summary");
    const firstError = ordersResult.error ?? branchesResult.error ?? customersResult.error ?? staffResult.error ?? (summaryMissing ? null : summaryResult.error);
    if (firstError) {
      setError(firstError.message);
      return;
    }

    const summaryByOrderId = new Map(
      (((summaryMissing ? [] : summaryResult.data) ?? []) as unknown as OrderFinancialSummary[]).map((summary) => [summary.order_id, summary]),
    );
    const orderRows = ((ordersResult.data ?? []) as unknown as OrderRow[]).map((order) => ({
      ...order,
      financial_summary: summaryByOrderId.get(order.id) ?? null,
    }));
    const branchRows = (branchesResult.data ?? []) as BranchOption[];

    setOrders(orderRows);
    setBranches(branchRows);
    setCustomers((customersResult.data ?? []) as CustomerOption[]);
    setStaff((staffResult.data ?? []) as StaffOption[]);

    if (role === "admin" && !form.branch_id && branchRows[0]) {
      setForm((current) => ({ ...current, branch_id: branchRows[0].id }));
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  const currentBranchId = role === "branch_manager" || role === "field_staff" ? branchId ?? "" : form.branch_id;
  const customerOptions = customers.filter((customer) => !currentBranchId || customer.branch_id === currentBranchId);
  const staffOptions = staff.filter((profile) => {
    if (role === "field_staff") return profile.id === userId;
    if (role === "branch_manager") return profile.branch_id === branchId;
    if (!currentBranchId) return true;
    return profile.branch_id === currentBranchId || profile.role === "admin";
  });
  const debtPreview = Math.max(Number(form.total_amount || 0) - Number(form.paid_amount || 0), 0);

  const filteredOrders = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return orders.filter((order) => {
      const matchesQuery =
        !keyword ||
        order.order_code.toLowerCase().includes(keyword) ||
        String(order.customers?.name ?? "").toLowerCase().includes(keyword) ||
        String(order.customers?.phone ?? "").toLowerCase().includes(keyword) ||
        String(order.assigned_staff?.full_name ?? "").toLowerCase().includes(keyword);
      const matchesBranch = !branchFilter || order.branch_id === branchFilter;
      const matchesStatus = !statusFilter || order.status === statusFilter;
      const matchesService = !serviceFilter || order.service_type === serviceFilter;
      const matchesPayment = !paymentFilter || order.payment_status === paymentFilter;
      const orderDate = order.order_date ?? "";
      const matchesFromDate = !fromDate || orderDate >= fromDate;
      const matchesToDate = !toDate || orderDate <= toDate;
      return matchesQuery && matchesBranch && matchesStatus && matchesService && matchesPayment && matchesFromDate && matchesToDate;
    });
  }, [orders, query, branchFilter, statusFilter, serviceFilter, paymentFilter, fromDate, toDate]);

  async function exportOrders() {
    await exportToExcel("don-hang", "Đơn hàng", [
      { header: "Mã đơn", key: "Mã đơn", width: 16 },
      { header: "Khách hàng", key: "Khách hàng", width: 28 },
      { header: "Số điện thoại", key: "Số điện thoại", width: 18 },
      { header: "Chi nhánh", key: "Chi nhánh", width: 32 },
      { header: "Nhân viên phụ trách", key: "Nhân viên phụ trách", width: 28 },
      { header: "Dịch vụ", key: "Dịch vụ", width: 22 },
      { header: "Trạng thái", key: "Trạng thái", width: 18 },
      { header: "Thanh toán", key: "Thanh toán", width: 18 },
      { header: "Tổng tiền", key: "Tổng tiền", money: true, width: 18 },
      { header: "Đã thu", key: "Đã thu", money: true, width: 18 },
      { header: "Còn nợ", key: "Còn nợ", money: true, width: 18 },
      { header: "Tổng chi phí", key: "Tổng chi phí", money: true, width: 18 },
      { header: "Lợi nhuận sau chi", key: "Lợi nhuận sau chi", money: true, width: 20 },
      { header: "Nhân viên thực nhận", key: "Nhân viên thực nhận", money: true, width: 22 },
      { header: "Chủ/cửa hàng thực nhận", key: "Chủ/cửa hàng thực nhận", money: true, width: 24 },
      { header: "Còn phải nộp chủ", key: "Còn phải nộp chủ", money: true, width: 20 },
      { header: "Trạng thái nộp tiền", key: "Trạng thái nộp tiền", width: 20 },
      { header: "Ngày đơn", key: "Ngày đơn", width: 14 },
    ], filteredOrders.map((order) => ({
      "Mã đơn": order.order_code,
      "Khách hàng": order.customers?.name ?? "",
      "Số điện thoại": order.customers?.phone ?? "",
      "Chi nhánh": order.branches?.name ?? "",
      "Nhân viên phụ trách": order.assigned_staff?.full_name ?? "",
      "Dịch vụ": order.service_type,
      "Trạng thái": order.status,
      "Thanh toán": order.payment_status,
      "Tổng tiền": Number(order.total_amount ?? 0),
      "Đã thu": Number(order.paid_amount ?? 0),
      "Còn nợ": Number(order.debt_amount ?? 0),
      "Tổng chi phí": financialValue(order, "total_expenses"),
      "Lợi nhuận sau chi": financialValue(order, "net_profit"),
      "Nhân viên thực nhận": financialValue(order, "staff_total_receivable"),
      "Chủ/cửa hàng thực nhận": financialValue(order, "owner_total_receivable"),
      "Còn phải nộp chủ": financialValue(order, "handover_remaining_amount"),
      "Trạng thái nộp tiền": handoverStatus(order),
      "Ngày đơn": order.order_date ?? "",
    })));
  }

  function updateForm(name: keyof FormState, value: string) {
    setForm((current) => {
      const next = { ...current, [name]: value };
      if (name === "branch_id") {
        next.customer_id = "";
        next.assigned_staff_id = isFieldStaff ? userId : "";
      }
      if (name === "customer_id") {
        const selectedCustomer = customers.find((customer) => customer.id === value);
        next.assigned_staff_id = isFieldStaff ? userId : selectedCustomer?.assigned_staff_id ?? "";
      }
      if (name === "collected_by_type" && value !== "staff") {
        next.collected_by_staff_id = "";
      }
      if (name === "collected_by_type" && value === "staff" && !next.collected_by_staff_id) {
        next.collected_by_staff_id = isFieldStaff ? userId : next.assigned_staff_id;
      }
      return next;
    });
  }

  function resetForm() {
    setEditing(null);
    setMessage("");
    setShowQuickCustomer(false);
    setQuickCustomerSaving(false);
    setQuickCustomer(initialQuickCustomer);
    setForm({
      ...initialForm,
      branch_id: role === "branch_manager" || role === "field_staff" ? branchId ?? "" : branches[0]?.id ?? "",
      assigned_staff_id: isFieldStaff ? userId : "",
      collected_by_type: isFieldStaff ? "staff" : initialForm.collected_by_type,
      collected_by_staff_id: isFieldStaff ? userId : "",
    });
  }

  function updateQuickCustomer(name: keyof QuickCustomerForm, value: string) {
    setQuickCustomer((current) => ({ ...current, [name]: value }));
  }

  async function saveQuickCustomer() {
    if (quickCustomerSaving) return;
    const payloadBranchId = isFieldStaff ? branchId ?? "" : role === "branch_manager" ? branchId ?? "" : form.branch_id;
    if (isFieldStaff && !payloadBranchId) {
      setError("Tài khoản nhân viên chưa được gán chi nhánh.");
      return;
    }

    const customerPayload = {
      name: quickCustomer.name.trim(),
      phone: quickCustomer.phone.trim(),
      address: quickCustomer.address.trim() || undefined,
      customer_type: quickCustomer.customer_type,
      note: quickCustomer.note.trim() || undefined,
      branch_id: payloadBranchId,
      assigned_staff_id: isFieldStaff ? userId : undefined,
    };

    const validation = customerSchema.safeParse(customerPayload);

    if (!validation.success) {
      setError(validation.error.issues[0]?.message ?? "Không thể thêm khách hàng. Vui lòng kiểm tra thông tin hoặc quyền truy cập.");
      return;
    }

    setQuickCustomerSaving(true);
    setError("");

    const insertPayload = {
      ...validation.data,
      address: validation.data.address || null,
      assigned_staff_id: isFieldStaff ? userId : null,
      note: validation.data.note || null,
      created_by: userId,
    };

    const result = await supabase
      .from("customers")
      .insert(insertPayload)
      .select("id, customer_code, name, phone, branch_id, assigned_staff_id")
      .single();

    setQuickCustomerSaving(false);

    if (result.error || !result.data) {
      if (process.env.NODE_ENV === "development") {
        console.log("QUICK_CUSTOMER_SUPABASE_ERROR", {
          message: result.error?.message,
          details: result.error?.details,
          hint: result.error?.hint,
          code: result.error?.code,
          payload: insertPayload,
        });
      }
      setError("Không thể thêm khách hàng. Vui lòng kiểm tra thông tin hoặc quyền truy cập.");
      return;
    }

    const createdCustomer = result.data as CustomerOption;
    setCustomers((current) => [createdCustomer, ...current]);
    setForm((current) => ({
      ...current,
      customer_id: createdCustomer.id,
      assigned_staff_id: isFieldStaff ? userId : createdCustomer.assigned_staff_id ?? current.assigned_staff_id,
    }));
    setQuickCustomer(initialQuickCustomer);
    setShowQuickCustomer(false);
    setMessage("Đã thêm khách hàng và chọn vào đơn hàng");
  }

  function startEdit(order: OrderRow) {
    if (isFieldStaff && order.assigned_staff_id !== userId && order.created_by !== userId) {
      setError("Bạn chỉ được xem đơn hàng được giao cho mình.");
      return;
    }
    setEditing(order);
    setMessage("");
    setForm({
      customer_id: order.customer_id ?? "",
      branch_id: order.branch_id ?? "",
      assigned_staff_id: order.assigned_staff_id ?? "",
      service_type: order.service_type,
      status: order.status,
      payment_status: order.payment_status,
      request_description: order.request_description ?? "",
      technical_note: order.technical_note ?? "",
      total_amount: String(order.total_amount ?? 0),
      paid_amount: String(order.paid_amount ?? 0),
      collected_by_type: order.collected_by_type ?? "store",
      collected_by_staff_id: order.collected_by_staff_id ?? "",
      collection_method: order.collection_method ?? "Tiền mặt",
      order_date: order.order_date ?? today,
    });
  }

  async function saveOrder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage && !isFieldStaff) {
      setError("Bạn không có quyền tạo đơn hàng.");
      return;
    }
    if (isFieldStaff && !branchId) {
      setError("Tài khoản nhân viên chưa được gán chi nhánh.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    const payload = {
      customer_id: form.customer_id,
      branch_id: isFieldStaff ? branchId ?? "" : role === "branch_manager" ? branchId ?? "" : form.branch_id,
      assigned_staff_id: isFieldStaff ? userId : form.assigned_staff_id || undefined,
      service_type: form.service_type,
      status: form.status,
      payment_status: form.payment_status,
      request_description: form.request_description || undefined,
      technical_note: form.technical_note || undefined,
      total_amount: Number(form.total_amount || 0),
      paid_amount: Number(form.paid_amount || 0),
      collected_by_type: form.collected_by_type,
      collected_by_staff_id: isFieldStaff && form.collected_by_type === "staff" ? userId : form.collected_by_staff_id || undefined,
      collection_method: form.collection_method,
      order_date: form.order_date,
    };

    const validation = orderSchema.safeParse(payload);
    if (!validation.success) {
      setSaving(false);
      setError(validation.error.issues[0]?.message ?? "Dữ liệu đơn hàng chưa hợp lệ");
      return;
    }

    const cleanedPayload = {
      ...validation.data,
      branch_id: isFieldStaff ? branchId ?? "" : validation.data.branch_id,
      assigned_staff_id: isFieldStaff ? userId : validation.data.assigned_staff_id || null,
      collected_by_staff_id: isFieldStaff && validation.data.collected_by_type === "staff" ? userId : validation.data.collected_by_staff_id || null,
      request_description: validation.data.request_description || null,
      technical_note: validation.data.technical_note || null,
    };

    const updatePayload = isFieldStaff
      ? {
          customer_id: cleanedPayload.customer_id,
          branch_id: editing?.branch_id ?? branchId ?? "",
          assigned_staff_id: editing?.assigned_staff_id ?? userId,
          service_type: cleanedPayload.service_type,
          status: cleanedPayload.status,
          payment_status: cleanedPayload.payment_status,
          request_description: cleanedPayload.request_description,
          technical_note: cleanedPayload.technical_note,
          total_amount: cleanedPayload.total_amount,
          paid_amount: cleanedPayload.paid_amount,
          collected_by_type: cleanedPayload.collected_by_type,
          collected_by_staff_id: cleanedPayload.collected_by_type === "staff" ? userId : cleanedPayload.collected_by_staff_id,
          collection_method: cleanedPayload.collection_method,
          order_date: cleanedPayload.order_date,
        }
      : cleanedPayload;

    const finalOrderPayload = editing ? updatePayload : { ...cleanedPayload, created_by: userId };
    const currentUser = { id: userId, role, branch_id: branchId };
    console.log("ORDER_SAVE_DEBUG", {
      currentUser,
      role: currentUser?.role,
      userId: currentUser?.id,
      branchId: currentUser?.branch_id,
      payload: finalOrderPayload,
    });

    if (!editing && isFieldStaff) {
      console.log("Field staff order insert payload:", {
        role,
        userId,
        branchId,
        assignedStaffId: cleanedPayload.assigned_staff_id,
        createdBy: userId,
      });
    }

    const result = editing
      ? await supabase.from("orders").update(updatePayload).eq("id", editing.id).select("id, branch_id, order_code").single()
      : await supabase.from("orders").insert(finalOrderPayload).select("id, branch_id, order_code").single();

    setSaving(false);

    if (result.error) {
      console.warn("SUPABASE_ORDER_ERROR_DETAIL", {
        message: result.error?.message,
        details: result.error?.details,
        hint: result.error?.hint,
        code: result.error?.code,
        raw: result.error,
      });
      const developerMessage = process.env.NODE_ENV === "development" && result.error.message ? ` ${result.error.message}` : "";
      setError(editing ? `Không thể lưu đơn hàng.${developerMessage}` : `Không thể tạo đơn hàng.${developerMessage}`);
      return;
    }

    if (!result.data) {
      console.warn("ORDER_SAVE_NO_DATA", result);
      setError("Đã lưu hoặc đã gọi Supabase nhưng không đọc lại được dữ liệu. Kiểm tra RLS SELECT policy.");
      return;
    }

    if (role !== "admin") {
      const changedAmount = editing && Number(editing.total_amount ?? 0) !== Number(cleanedPayload.total_amount ?? 0);
      const changedPaid = editing && Number(editing.paid_amount ?? 0) !== Number(cleanedPayload.paid_amount ?? 0);
      const changedPaymentStatus = editing && editing.payment_status !== cleanedPayload.payment_status;
      const changedImportantStatus = editing && editing.status !== cleanedPayload.status && ["Hoàn tất", "Hủy"].includes(cleanedPayload.status);
      const type = !editing
        ? "order_created"
        : changedAmount
          ? "order_amount_changed"
          : changedPaid || changedPaymentStatus
            ? "order_updated"
            : changedImportantStatus
              ? "order_status_changed"
              : "order_updated";

      await createAdminNotification(supabase, {
        title: editing ? "Đơn hàng được cập nhật" : "Đơn hàng mới",
        message: `${ROLE_LABELS[role]} đã ${editing ? "cập nhật" : "tạo"} đơn ${result.data.order_code}`,
        notification_type: type,
        entity_type: "order",
        entity_id: result.data.id,
        branch_id: result.data.branch_id,
        actor_id: userId,
        actor_role: role,
      });
      await writeAuditLog(supabase, {
        action: type,
        entity_type: "order",
        entity_id: result.data.id,
        branch_id: result.data.branch_id,
        actor_id: userId,
        old_data: editing ? { ...editing } : null,
        new_data: cleanedPayload,
      });
    }

    setMessage(editing ? "Đã cập nhật đơn hàng" : "Đã thêm đơn hàng");
    if (!editing) {
      router.push(`/orders/${result.data.id}`);
      return;
    }

    resetForm();
    await loadData();
  }

  return (
    <div className="space-y-6 pb-[120px] md:pb-0">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Đơn hàng</h1>
          <p className="text-sm text-muted-foreground">Quản lý đơn dịch vụ, tiến độ xử lý, thanh toán, chi phí và công nợ.</p>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:justify-end">
          {(canManage || isFieldStaff) ? (
            <Button type="button" className="w-full sm:w-auto" onClick={resetForm}>
              <Save className="h-4 w-4" />
              <span className="sm:hidden">Thêm đơn</span>
              <span className="hidden sm:inline">Thêm đơn hàng</span>
            </Button>
          ) : null}
          <Button className="w-full bg-slate-900 sm:w-auto" onClick={() => void loadData()}>
            <RefreshCcw className="h-4 w-4" />
            Tải lại
          </Button>
          <Button className="w-full sm:w-auto" disabled={filteredOrders.length === 0} onClick={() => void exportOrders()}>
            <Download className="h-4 w-4" />
            <span className="sm:hidden">Excel</span>
            <span className="hidden sm:inline">Xuất Excel</span>
          </Button>
        </div>
      </div>

      {(canManage || isFieldStaff || editing) ? (
        <Card>
          <h2 className="mb-4 font-semibold">{editing ? `Sửa đơn ${editing.order_code}` : "Thêm đơn hàng"}</h2>
          <form onSubmit={saveOrder} className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <label className="space-y-2">
              <span className="text-sm font-medium">Chi nhánh</span>
              <Select value={form.branch_id} disabled={role === "branch_manager" || isFieldStaff} onChange={(event) => updateForm("branch_id", event.target.value)}>
                <option value="">Chọn chi nhánh</option>
                {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
              </Select>
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium">Khách hàng</span>
              <Select value={form.customer_id} onChange={(event) => updateForm("customer_id", event.target.value)}>
                <option value="">Chọn khách hàng</option>
                {customerOptions.map((customer) => <option key={customer.id} value={customer.id}>{customer.customer_code} - {customer.name} - {customer.phone}</option>)}
              </Select>
              <button type="button" className="text-left text-xs font-medium text-primary" onClick={() => setShowQuickCustomer((current) => !current)}>
                {showQuickCustomer ? "Ẩn thêm khách hàng nhanh" : "Thêm khách hàng nhanh"}
              </button>
            </label>
            {showQuickCustomer ? (
              <div className="grid gap-3 rounded-md border bg-muted/30 p-3 md:col-span-2 xl:col-span-3">
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <Input value={quickCustomer.name} onChange={(event) => updateQuickCustomer("name", event.target.value)} placeholder="Tên khách hàng" />
                  <Input value={quickCustomer.phone} onChange={(event) => updateQuickCustomer("phone", event.target.value)} placeholder="Số điện thoại" />
                  <Select value={quickCustomer.customer_type} onChange={(event) => updateQuickCustomer("customer_type", event.target.value)}>
                    {CUSTOMER_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                  </Select>
                  <Input value={quickCustomer.address} onChange={(event) => updateQuickCustomer("address", event.target.value)} placeholder="Địa chỉ" />
                </div>
                <Textarea value={quickCustomer.note} onChange={(event) => updateQuickCustomer("note", event.target.value)} placeholder="Ghi chú khách hàng" />
                <div>
                  <Button type="button" className="w-full sm:w-auto" disabled={quickCustomerSaving} onClick={() => void saveQuickCustomer()}>
                    {quickCustomerSaving ? "Đang lưu..." : "Lưu khách hàng"}
                  </Button>
                </div>
              </div>
            ) : null}
            <label className="space-y-2">
              <span className="text-sm font-medium">Nhân viên phụ trách</span>
              <Select value={form.assigned_staff_id} disabled={!canManage || isFieldStaff} onChange={(event) => updateForm("assigned_staff_id", event.target.value)}>
                <option value="">Chưa giao</option>
                {staffOptions.map((profile) => <option key={profile.id} value={profile.id}>{staffLabel(profile)}</option>)}
              </Select>
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium">Loại dịch vụ</span>
              <Select value={form.service_type} onChange={(event) => updateForm("service_type", event.target.value)}>
                <option value="">Chọn loại dịch vụ</option>
                {SERVICE_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
              </Select>
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium">Trạng thái</span>
              <Select value={form.status} onChange={(event) => updateForm("status", event.target.value)}>
                {ORDER_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
              </Select>
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium">Trạng thái thanh toán</span>
              <Select value={form.payment_status} onChange={(event) => updateForm("payment_status", event.target.value)}>
                {PAYMENT_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
              </Select>
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium">Tổng tiền</span>
              <Input type="number" min="0" value={form.total_amount} onChange={(event) => updateForm("total_amount", event.target.value)} />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium">Đã thu</span>
              <Input type="number" min="0" value={form.paid_amount} onChange={(event) => updateForm("paid_amount", event.target.value)} />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium">Người thu tiền</span>
              <Select value={form.collected_by_type} onChange={(event) => updateForm("collected_by_type", event.target.value)}>
                {COLLECTED_BY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </Select>
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium">Nhân viên thu tiền</span>
              <Select value={form.collected_by_staff_id} disabled={form.collected_by_type !== "staff" || isFieldStaff} onChange={(event) => updateForm("collected_by_staff_id", event.target.value)}>
                <option value="">Chọn nhân viên thu tiền</option>
                {staffOptions.map((profile) => <option key={profile.id} value={profile.id}>{staffLabel(profile)}</option>)}
              </Select>
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium">Hình thức thu</span>
              <Select value={form.collection_method} onChange={(event) => updateForm("collection_method", event.target.value)}>
                {COLLECTION_METHODS.map((method) => <option key={method} value={method}>{method}</option>)}
              </Select>
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium">Ngày đơn hàng</span>
              <Input type="date" value={form.order_date} onChange={(event) => updateForm("order_date", event.target.value)} />
            </label>
            <label className="space-y-2 md:col-span-2 xl:col-span-3">
              <span className="text-sm font-medium">Mô tả lỗi/yêu cầu</span>
              <Textarea value={form.request_description} onChange={(event) => updateForm("request_description", event.target.value)} />
            </label>
            <label className="space-y-2 md:col-span-2 xl:col-span-3">
              <span className="text-sm font-medium">Ghi chú kỹ thuật</span>
              <Textarea value={form.technical_note} onChange={(event) => updateForm("technical_note", event.target.value)} />
            </label>
            <div className="flex flex-col justify-end gap-2">
              <div className="rounded-md bg-muted px-3 py-2 text-sm">Còn nợ dự kiến: <strong>{formatMoney(debtPreview)}</strong></div>
              <div className="flex gap-2">
                <Button disabled={saving}>
                  <Save className="h-4 w-4" />
                  {saving ? "Đang lưu..." : editing ? "Cập nhật" : "Lưu đơn rồi tải hóa đơn/chứng từ"}
                </Button>
                {editing ? <Button type="button" className="bg-slate-700" onClick={resetForm}>Hủy</Button> : null}
              </div>
            </div>
          </form>
          {message ? <p className="mt-4 rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p> : null}
        </Card>
      ) : null}

      <Card>
        <div className="grid gap-3 lg:grid-cols-3 xl:grid-cols-6">
          <div className="relative lg:col-span-3 xl:col-span-2">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm mã đơn, tên, số điện thoại hoặc nhân viên" />
          </div>
          <Input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} title="Từ ngày" />
          <Input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} title="Đến ngày" />
          <Select value={branchFilter} disabled={!canUseBranchFilter} onChange={(event) => setBranchFilter(event.target.value)}>
            <option value="">Tất cả chi nhánh</option>
            {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </Select>
          <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="">Tất cả trạng thái</option>
            {ORDER_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
          </Select>
          <Select value={serviceFilter} onChange={(event) => setServiceFilter(event.target.value)}>
            <option value="">Tất cả dịch vụ</option>
            {SERVICE_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
          </Select>
          <Select value={paymentFilter} onChange={(event) => setPaymentFilter(event.target.value)}>
            <option value="">Tất cả thanh toán</option>
            {PAYMENT_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
          </Select>
        </div>

        {error ? <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

        <div className="mt-4 space-y-3 md:hidden">
          {loading ? (
            <div className="rounded-md border p-4 text-center text-sm text-muted-foreground">Đang tải danh sách đơn hàng...</div>
          ) : filteredOrders.length === 0 ? (
            <div className="rounded-md border p-4 text-center text-sm text-muted-foreground">Chưa có đơn hàng phù hợp</div>
          ) : filteredOrders.map((order) => (
            <div key={order.id} className="rounded-md border bg-white p-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold">{order.order_code}</div>
                  <div className="truncate text-muted-foreground">{order.customers?.name ?? "-"} · {order.customers?.phone ?? ""}</div>
                </div>
                <Badge>{order.status}</Badge>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div>
                  <div className="text-xs text-muted-foreground">Thanh toán</div>
                  <Badge>{order.payment_status}</Badge>
                </div>
                <div className="text-right">
                  <div className="text-xs text-muted-foreground">Tổng tiền</div>
                  <div className="font-medium">{formatMoney(order.total_amount)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Đã thu</div>
                  <div className="font-medium">{formatMoney(order.paid_amount)}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-muted-foreground">Còn nợ</div>
                  <div className="font-medium">{formatMoney(order.debt_amount)}</div>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Link className="inline-flex h-9 items-center justify-center gap-1 rounded-md bg-slate-900 px-3 text-xs font-medium text-white" href={`/orders/${order.id}` as Route}>
                  <Eye className="h-3.5 w-3.5" />
                  Xem
                </Link>
                {(canManage || (isFieldStaff && (order.assigned_staff_id === userId || order.created_by === userId))) ? (
                  <Button className="h-9 px-3" onClick={() => startEdit(order)}>{isFieldStaff ? "Cập nhật" : "Sửa"}</Button>
                ) : null}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 hidden overflow-x-auto md:block">
          <table className="w-full min-w-[1680px] text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-3">Mã đơn</th>
                <th>Khách hàng</th>
                <th>Chi nhánh</th>
                <th>Nhân viên phụ trách</th>
                <th>Dịch vụ</th>
                <th>Trạng thái</th>
                <th>Thanh toán</th>
                <th className="text-right">Tổng tiền</th>
                <th className="text-right">Đã thu</th>
                <th className="text-right">Còn nợ</th>
                <th className="text-right">Tổng chi phí</th>
                <th className="text-right">Lợi nhuận sau chi</th>
                <th className="text-right">Nhân viên thực nhận</th>
                <th className="text-right">Chủ/cửa hàng thực nhận</th>
                <th className="text-right">Còn phải nộp chủ</th>
                <th>Trạng thái nộp tiền</th>
                <th className="text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td className="py-8 text-center text-muted-foreground" colSpan={17}>Đang tải danh sách đơn hàng...</td></tr>
              ) : filteredOrders.length === 0 ? (
                <tr><td className="py-8 text-center text-muted-foreground" colSpan={17}>Chưa có đơn hàng phù hợp</td></tr>
              ) : filteredOrders.map((order) => (
                <tr key={order.id} className="border-b">
                  <td className="py-3 font-medium">{order.order_code}</td>
                  <td>{order.customers?.name ?? "-"}<div className="text-xs text-muted-foreground">{order.customers?.phone ?? ""}</div></td>
                  <td>{order.branches?.name ?? "-"}</td>
                  <td>{order.assigned_staff?.full_name ?? "Chưa giao"}</td>
                  <td>{order.service_type}</td>
                  <td><Badge>{order.status}</Badge></td>
                  <td><Badge>{order.payment_status}</Badge></td>
                  <td className="text-right">{formatMoney(order.total_amount)}</td>
                  <td className="text-right">{formatMoney(order.paid_amount)}</td>
                  <td className="text-right">{formatMoney(order.debt_amount)}</td>
                  <td className="text-right">{formatMoney(financialValue(order, "total_expenses"))}</td>
                  <td className="text-right">{formatMoney(financialValue(order, "net_profit"))}</td>
                  <td className="text-right">{formatMoney(financialValue(order, "staff_total_receivable"))}</td>
                  <td className="text-right">{formatMoney(financialValue(order, "owner_total_receivable"))}</td>
                  <td className="text-right">{formatMoney(financialValue(order, "handover_remaining_amount"))}</td>
                  <td><Badge>{handoverStatus(order)}</Badge></td>
                  <td className="py-3 text-right">
                    <Link className="mr-2 inline-flex h-8 items-center gap-1 rounded-md bg-slate-900 px-3 text-xs font-medium text-white" href={`/orders/${order.id}` as Route}>
                      <Eye className="h-3.5 w-3.5" />
                      Xem
                    </Link>
                    {(canManage || (isFieldStaff && (order.assigned_staff_id === userId || order.created_by === userId))) ? (
                      <Button className="mr-2 h-8 px-3" onClick={() => startEdit(order)}>{isFieldStaff ? "Cập nhật" : "Sửa"}</Button>
                    ) : null}
                    {role === "branch_manager" ? <CancelOrderButton orderId={order.id} role={role} onCancelled={() => void loadData()} /> : null}
                    {role === "admin" ? <DeleteOrderButton orderId={order.id} role={role} onDeleted={() => void loadData()} /> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
