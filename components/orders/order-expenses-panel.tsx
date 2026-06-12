"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Save, Trash2, Upload } from "lucide-react";
import {
  DEFAULT_OWNER_SHARE_PERCENT,
  DEFAULT_STAFF_SHARE_PERCENT,
  EXPENSE_PAID_BY_LABELS,
  EXPENSE_PAID_BY_OPTIONS,
  EXPENSE_TYPES,
  FILE_BUCKET,
} from "@/lib/constants/app";
import { sanitizeFileName } from "@/lib/storage/files";
import { createAdminNotification, writeAuditLog } from "@/lib/notifications/admin-notifications";
import { createClient } from "@/lib/supabase/browser";
import type { ExpensePaidBy } from "@/lib/constants/app";
import type { OrderExpense, OrderFinancialSummary, UserRole } from "@/lib/types/database";
import { formatDate, formatMoney } from "@/lib/utils/format";
import { orderExpenseSchema, validateUploadFile } from "@/lib/validations/schemas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type StaffOption = {
  id: string;
  full_name: string;
  branch_id: string | null;
};

type ExpenseRow = OrderExpense & {
  paid_by_staff?: { full_name: string | null } | null;
};

type FormState = {
  expense_type: string;
  description: string;
  amount: string;
  paid_by: ExpensePaidBy;
  paid_by_staff_id: string;
  expense_date: string;
  note: string;
};

const today = new Date().toISOString().slice(0, 10);
const initialForm: FormState = {
  expense_type: EXPENSE_TYPES[0],
  description: "",
  amount: "",
  paid_by: "staff",
  paid_by_staff_id: "",
  expense_date: today,
  note: "",
};

function emptySummary(orderId: string, branchId: string | null): OrderFinancialSummary {
  return {
    order_id: orderId,
    branch_id: branchId,
    assigned_staff_id: null,
    total_amount: 0,
    paid_amount: 0,
    debt_amount: 0,
    total_expenses: 0,
    staff_paid_expenses: 0,
    store_paid_expenses: 0,
    owner_paid_expenses: 0,
    net_profit: 0,
    staff_profit_share: 0,
    owner_profit_share: 0,
    staff_total_receivable: 0,
    owner_total_receivable: 0,
    collected_by_type: "store",
    collected_by_staff_id: null,
    collection_method: "Tiền mặt",
    handover_required_amount: 0,
    handover_paid_amount: 0,
    handover_remaining_amount: 0,
    handover_status: "Không cần nộp",
  };
}

export function OrderExpensesPanel({
  orderId,
  branchId,
  role,
  assignedStaffId,
}: {
  orderId: string;
  branchId: string | null;
  role: UserRole;
  assignedStaffId: string | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const canManage = role === "admin" || role === "branch_manager";
  const canDelete = canManage;
  const canAdd = canManage || role === "field_staff";
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [summary, setSummary] = useState<OrderFinancialSummary>(emptySummary(orderId, branchId));
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [form, setForm] = useState<FormState>({ ...initialForm, paid_by_staff_id: assignedStaffId ?? "" });
  const [editingExpense, setEditingExpense] = useState<ExpenseRow | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadData() {
    setLoading(true);
    setError("");

    const [expensesResult, summaryResult, staffResult] = await Promise.all([
      supabase
        .from("order_expenses")
        .select("*, paid_by_staff:profiles!order_expenses_paid_by_staff_id_fkey(full_name)")
        .eq("order_id", orderId)
        .order("expense_date", { ascending: false }),
      supabase.from("order_financial_summary").select("*").eq("order_id", orderId).maybeSingle(),
      supabase.from("profiles").select("id, full_name, branch_id").eq("is_active", true).in("role", ["field_staff", "branch_manager"]).order("full_name"),
    ]);

    setLoading(false);

    const firstError = expensesResult.error ?? summaryResult.error ?? staffResult.error;
    if (firstError) {
      setError(firstError.message);
      return;
    }

    const expenseRows = (expensesResult.data ?? []) as unknown as ExpenseRow[];
    setExpenses(expenseRows);
    setSummary((summaryResult.data as unknown as OrderFinancialSummary | null) ?? emptySummary(orderId, branchId));
    setStaff(((staffResult.data ?? []) as StaffOption[]).filter((profile) => !branchId || profile.branch_id === branchId));

    const urls: Record<string, string> = {};
    await Promise.all(
      expenseRows.map(async (expense) => {
        if (!expense.proof_file_path) return;
        const { data } = await supabase.storage.from(FILE_BUCKET).createSignedUrl(expense.proof_file_path, 60 * 10);
        urls[expense.id] = data?.signedUrl ?? expense.proof_file_url ?? "";
      }),
    );
    setSignedUrls(urls);
  }

  useEffect(() => {
    void loadData();
  }, []);

  function updateForm<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => {
      const next = { ...current, [key]: value };
      if (key === "paid_by" && value !== "staff") next.paid_by_staff_id = "";
      if (key === "paid_by" && value === "staff" && !next.paid_by_staff_id) next.paid_by_staff_id = assignedStaffId ?? "";
      return next;
    });
  }

  async function uploadProof(expenseId: string, proof: File) {
    if (!branchId) throw new Error("Đơn hàng chưa có chi nhánh để lưu chứng từ");

    const validation = validateUploadFile(proof);
    if (validation) throw new Error(validation);

    const storageFileName = `${Date.now()}-${sanitizeFileName(proof.name)}`;
    const filePath = `branch/${branchId}/orders/${orderId}/expenses/${expenseId}/${storageFileName}`;
    const uploadResult = await supabase.storage.from(FILE_BUCKET).upload(filePath, proof, {
      cacheControl: "3600",
      upsert: false,
      contentType: proof.type,
    });

    if (uploadResult.error) throw new Error(`Tải chứng từ thất bại: ${uploadResult.error.message}`);

    const { data } = supabase.storage.from(FILE_BUCKET).getPublicUrl(filePath);
    const updateResult = await supabase
      .from("order_expenses")
      .update({ proof_file_path: filePath, proof_file_url: data.publicUrl })
      .eq("id", expenseId);

    if (updateResult.error) {
      await supabase.storage.from(FILE_BUCKET).remove([filePath]);
      throw new Error(`Lưu chứng từ thất bại: ${updateResult.error.message}`);
    }
  }

  async function saveExpense(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canAdd || !branchId) return;

    setSaving(true);
    setError("");
    setMessage("");

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setSaving(false);
      setError("Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.");
      return;
    }

    const payload = {
      order_id: orderId,
      branch_id: branchId,
      expense_type: form.expense_type,
      description: form.description || undefined,
      amount: Number(form.amount || 0),
      paid_by: form.paid_by,
      paid_by_staff_id: form.paid_by_staff_id || undefined,
      expense_date: form.expense_date,
      note: form.note || undefined,
      created_by: user.id,
    };

    const validation = orderExpenseSchema.safeParse(payload);
    if (!validation.success) {
      setSaving(false);
      setError(validation.error.issues[0]?.message ?? "Dữ liệu chi phí chưa hợp lệ");
      return;
    }

    const cleanedPayload = {
        ...validation.data,
        description: validation.data.description || null,
        paid_by_staff_id: validation.data.paid_by_staff_id || null,
        note: validation.data.note || null,
      };

    const saveResult = editingExpense
      ? await supabase.from("order_expenses").update(cleanedPayload).eq("id", editingExpense.id).select("id").single()
      : await supabase.from("order_expenses").insert(cleanedPayload).select("id").single();

    if (saveResult.error || !saveResult.data) {
      setSaving(false);
      setError(saveResult.error?.message ?? "Không thể lưu chi phí");
      return;
    }

    try {
      if (file) await uploadProof(saveResult.data.id, file);
    } catch (uploadError) {
      setSaving(false);
      setError(uploadError instanceof Error ? uploadError.message : "Tải chứng từ thất bại");
      await loadData();
      return;
    }

    setSaving(false);
    if (role !== "admin") {
      await createAdminNotification(supabase, {
        title: editingExpense ? "Chi phí được cập nhật" : "Chi phí mới",
        message: `${editingExpense ? "Đã cập nhật" : "Đã thêm"} chi phí ${formatMoney(cleanedPayload.amount)}`,
        notification_type: editingExpense ? "expense_updated" : "expense_created",
        entity_type: "order_expense",
        entity_id: saveResult.data.id,
        branch_id: branchId,
        actor_id: user.id,
        actor_role: role,
      });
      await writeAuditLog(supabase, {
        action: editingExpense ? "expense_updated" : "expense_created",
        entity_type: "order_expense",
        entity_id: saveResult.data.id,
        branch_id: branchId,
        actor_id: user.id,
        old_data: editingExpense ? { ...editingExpense } : null,
        new_data: cleanedPayload,
      });
    }
    setMessage(editingExpense ? "Đã cập nhật chi phí" : "Đã thêm chi phí");
    setFile(null);
    setEditingExpense(null);
    setForm({ ...initialForm, paid_by_staff_id: assignedStaffId ?? "" });
    await loadData();
  }

  function startEditExpense(expense: ExpenseRow) {
    setEditingExpense(expense);
    setMessage("");
    setError("");
    setFile(null);
    setForm({
      expense_type: expense.expense_type,
      description: expense.description ?? "",
      amount: String(expense.amount ?? ""),
      paid_by: expense.paid_by,
      paid_by_staff_id: expense.paid_by_staff_id ?? "",
      expense_date: expense.expense_date ?? today,
      note: expense.note ?? "",
    });
  }

  function cancelEditExpense() {
    setEditingExpense(null);
    setFile(null);
    setForm({ ...initialForm, paid_by_staff_id: assignedStaffId ?? "" });
  }

  async function deleteExpense(expense: ExpenseRow) {
    if (!canDelete) return;
    if (!confirm("Bạn chắc chắn muốn xóa chi phí này?")) return;

    const { error: deleteError } = await supabase.from("order_expenses").delete().eq("id", expense.id);
    if (deleteError) {
      setError(deleteError.message);
      return;
    }
    if (expense.proof_file_path) {
      await supabase.storage.from(FILE_BUCKET).remove([expense.proof_file_path]);
    }
    if (role !== "admin") {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      await createAdminNotification(supabase, {
        title: "Chi phí bị xóa",
        message: `Đã xóa chi phí ${formatMoney(expense.amount)}`,
        notification_type: "expense_deleted",
        entity_type: "order_expense",
        entity_id: expense.id,
        branch_id: branchId,
        actor_id: user?.id ?? null,
        actor_role: role,
      });
    }
    setMessage("Đã xóa chi phí");
    await loadData();
  }

  const ownerPaidExpenses = Number(summary.store_paid_expenses ?? 0) + Number(summary.owner_paid_expenses ?? 0);

  return (
    <Card>
      <h2 className="mb-4 font-semibold">Chi phí & ăn chia</h2>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <SummaryItem label="Tổng tiền khách phải trả" value={formatMoney(summary.total_amount)} />
        <SummaryItem label="Đã thu" value={formatMoney(summary.paid_amount)} />
        <SummaryItem label="Còn nợ" value={formatMoney(summary.debt_amount)} />
        <SummaryItem label="Tổng chi phí" value={formatMoney(summary.total_expenses)} />
        <SummaryItem label="Lợi nhuận sau chi" value={formatMoney(summary.net_profit)} />
        <SummaryItem label={`Nhân viên hưởng ${DEFAULT_STAFF_SHARE_PERCENT}%`} value={formatMoney(summary.staff_profit_share)} />
        <SummaryItem label={`Chủ/cửa hàng hưởng ${DEFAULT_OWNER_SHARE_PERCENT}%`} value={formatMoney(summary.owner_profit_share)} />
        <SummaryItem label="Nhân viên đã ứng" value={formatMoney(summary.staff_paid_expenses)} />
        <SummaryItem label="Cửa hàng/chủ đã ứng" value={formatMoney(ownerPaidExpenses)} />
        <SummaryItem label="Nhân viên thực nhận" value={formatMoney(summary.staff_total_receivable)} />
        <SummaryItem label="Chủ/cửa hàng thực nhận" value={formatMoney(summary.owner_total_receivable)} />
      </div>

      {Number(summary.net_profit ?? 0) < 0 ? (
        <p className="mt-4 rounded-md bg-red-50 p-3 text-sm font-medium text-red-700">Đơn hàng đang lỗ sau khi trừ chi phí</p>
      ) : null}

      {canAdd ? (
        <form onSubmit={saveExpense} className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="md:col-span-2 xl:col-span-4">
            <h3 className="font-medium">{editingExpense ? "Sửa chi phí" : "Thêm chi phí"}</h3>
          </div>
          <label className="space-y-2">
            <span className="text-sm font-medium">Loại chi phí</span>
            <Select value={form.expense_type} onChange={(event) => updateForm("expense_type", event.target.value)}>
              {EXPENSE_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
            </Select>
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium">Số tiền</span>
            <Input type="number" min="1" value={form.amount} onChange={(event) => updateForm("amount", event.target.value)} />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium">Người ứng</span>
            <Select value={form.paid_by} onChange={(event) => updateForm("paid_by", event.target.value as ExpensePaidBy)}>
              {EXPENSE_PAID_BY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </Select>
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium">Nhân viên ứng tiền</span>
            <Select value={form.paid_by_staff_id} disabled={form.paid_by !== "staff"} onChange={(event) => updateForm("paid_by_staff_id", event.target.value)}>
              <option value="">Chọn nhân viên</option>
              {staff.map((profile) => <option key={profile.id} value={profile.id}>{profile.full_name}</option>)}
            </Select>
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium">Ngày chi</span>
            <Input type="date" value={form.expense_date} onChange={(event) => updateForm("expense_date", event.target.value)} />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium">File chứng từ</span>
            <Input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
          </label>
          <label className="space-y-2 md:col-span-2">
            <span className="text-sm font-medium">Nội dung chi phí</span>
            <Textarea value={form.description} onChange={(event) => updateForm("description", event.target.value)} />
          </label>
          <label className="space-y-2 md:col-span-2 xl:col-span-3">
            <span className="text-sm font-medium">Ghi chú</span>
            <Textarea value={form.note} onChange={(event) => updateForm("note", event.target.value)} />
          </label>
          <div className="flex items-end">
            <Button disabled={saving || !branchId}>
              {file ? <Upload className="h-4 w-4" /> : <Save className="h-4 w-4" />}
              {saving ? "Đang lưu..." : editingExpense ? "Cập nhật chi phí" : "Thêm chi phí"}
            </Button>
            {editingExpense ? (
              <Button type="button" className="ml-2 bg-slate-700" onClick={cancelEditExpense}>
                Hủy
              </Button>
            ) : null}
          </div>
        </form>
      ) : null}

      {message ? <p className="mt-4 rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p> : null}
      {error ? <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[980px] text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-3">Ngày chi</th>
              <th>Loại chi phí</th>
              <th>Nội dung chi phí</th>
              <th className="text-right">Số tiền</th>
              <th>Người ứng</th>
              <th>Nhân viên ứng</th>
              <th>Ghi chú</th>
              <th className="text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="py-8 text-center text-muted-foreground" colSpan={8}>Đang tải chi phí...</td></tr>
            ) : expenses.length === 0 ? (
              <tr><td className="py-8 text-center text-muted-foreground" colSpan={8}>Chưa có chi phí cho đơn hàng</td></tr>
            ) : expenses.map((expense) => (
              <tr key={expense.id} className="border-b">
                <td className="py-3">{formatDate(expense.expense_date)}</td>
                <td><Badge>{expense.expense_type}</Badge></td>
                <td>{expense.description ?? "-"}</td>
                <td className="text-right">{formatMoney(expense.amount)}</td>
                <td>{EXPENSE_PAID_BY_LABELS[expense.paid_by]}</td>
                <td>{expense.paid_by_staff?.full_name ?? "-"}</td>
                <td>{expense.note ?? "-"}</td>
                <td className="py-3 text-right">
                  {expense.proof_file_path ? (
                    <a className="mr-2 inline-flex h-8 items-center gap-1 rounded-md bg-slate-900 px-3 text-xs font-medium text-white" href={signedUrls[expense.id] ?? expense.proof_file_url ?? "#"} target="_blank" rel="noreferrer">
                      <ExternalLink className="h-3.5 w-3.5" />
                      Chứng từ
                    </a>
                  ) : null}
                  {canDelete ? (
                    <Button className="mr-2 h-8 px-3" onClick={() => startEditExpense(expense)}>
                      Sửa
                    </Button>
                  ) : null}
                  {canDelete ? (
                    <Button className="h-8 bg-destructive px-3" onClick={() => void deleteExpense(expense)}>
                      <Trash2 className="h-3.5 w-3.5" />
                      Xóa
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
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
