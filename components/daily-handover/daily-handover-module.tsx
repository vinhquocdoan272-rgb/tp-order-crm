"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ExternalLink, RefreshCcw, Send, XCircle } from "lucide-react";
import type { OrderFinancialSummary, UserRole } from "@/lib/types/database";
import { ACCEPTED_FILE_TYPES, FILE_BUCKET } from "@/lib/constants/app";
import { createAdminNotification, writeAuditLog } from "@/lib/notifications/admin-notifications";
import { sanitizeFileName } from "@/lib/storage/files";
import { createClient } from "@/lib/supabase/browser";
import { formatDate, formatMoney } from "@/lib/utils/format";
import { validateUploadFile } from "@/lib/validations/schemas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type StaffOption = { id: string; full_name: string; branch_id: string | null; branches?: { name: string | null } | null };
type OrderRow = {
  id: string;
  order_code: string;
  branch_id: string | null;
  assigned_staff_id: string | null;
  collected_by_type: string;
  collected_by_staff_id: string | null;
  status: string;
  order_date: string | null;
  branches?: { name: string | null } | null;
  financial_summary?: OrderFinancialSummary | null;
};
type SettlementRow = {
  id: string;
  settlement_code: string;
  branch_id: string | null;
  staff_id: string | null;
  settlement_date: string;
  total_required_amount: number | string;
  submitted_amount: number | string;
  remaining_amount: number | string;
  payment_method: string;
  status: string;
  proof_file_url: string | null;
  proof_file_path: string | null;
  proof_file_name: string | null;
  note: string | null;
  admin_note: string | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
  created_by: string | null;
  created_at: string;
  branches?: { name: string | null } | null;
  staff?: { full_name: string | null } | null;
};
type SettlementOrderRow = {
  id: string;
  settlement_id: string;
  order_id: string;
  required_amount: number | string;
  allocated_amount: number | string;
};

function allocateAmount(orders: OrderRow[], selectedIds: string[], submittedAmount: number) {
  let remaining = submittedAmount;
  return orders
    .filter((order) => selectedIds.includes(order.id))
    .sort((a, b) => String(a.order_date ?? "").localeCompare(String(b.order_date ?? "")))
    .map((order) => {
      const required = Number(order.financial_summary?.handover_remaining_amount ?? 0);
      const allocated = Math.min(required, Math.max(remaining, 0));
      remaining -= allocated;
      return { order_id: order.id, required_amount: required, allocated_amount: allocated };
    });
}

export function DailyHandoverModule({ role, userId, branchId }: { role: UserRole; userId: string; branchId: string | null }) {
  const supabase = useMemo(() => createClient(), []);
  const today = new Date().toISOString().slice(0, 10);
  const [settlementDate, setSettlementDate] = useState(today);
  const [selectedStaffId, setSelectedStaffId] = useState(role === "field_staff" ? userId : "");
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [pendingOrders, setPendingOrders] = useState<OrderRow[]>([]);
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [settlements, setSettlements] = useState<SettlementRow[]>([]);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [submittedAmount, setSubmittedAmount] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [adminNote, setAdminNote] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function loadData() {
    setLoading(true);
    setError("");
    const [staffResult, ordersResult, summaryResult, settlementResult] = await Promise.all([
      supabase.from("profiles").select("id, full_name, branch_id, branches(name)").eq("role", "field_staff").eq("is_active", true).order("full_name"),
      supabase.from("orders").select("id, order_code, branch_id, assigned_staff_id, collected_by_type, collected_by_staff_id, status, order_date, branches(name)").lte("order_date", settlementDate).neq("status", "Hủy").order("order_date"),
      supabase.from("order_financial_summary").select("*"),
      supabase.from("daily_handover_settlements").select("*, branches(name), staff:profiles!daily_handover_settlements_staff_id_fkey(full_name)").order("created_at", { ascending: false }),
    ]);
    setLoading(false);

    const firstError = staffResult.error ?? ordersResult.error ?? summaryResult.error ?? settlementResult.error;
    if (firstError) {
      setError(firstError.message);
      return;
    }

    const staffRows = (staffResult.data ?? []) as unknown as StaffOption[];
    setStaff(staffRows.filter((item) => role !== "branch_manager" || item.branch_id === branchId));

    const summaryByOrderId = new Map(((summaryResult.data ?? []) as unknown as OrderFinancialSummary[]).map((summary) => [summary.order_id, summary]));
    const staffId = role === "field_staff" ? userId : selectedStaffId;
    const orderRows = ((ordersResult.data ?? []) as unknown as OrderRow[])
      .map((order) => ({ ...order, financial_summary: summaryByOrderId.get(order.id) ?? null }))
      .filter((order) => {
        const remaining = Number(order.financial_summary?.handover_remaining_amount ?? 0);
        const matchesStaff = !staffId || order.assigned_staff_id === staffId || order.collected_by_staff_id === staffId;
        const matchesBranch = role !== "branch_manager" || order.branch_id === branchId;
        return order.collected_by_type === "staff" && remaining > 0 && matchesStaff && matchesBranch;
      });
    setPendingOrders(orderRows);
    setSelectedOrderIds((current) => current.filter((id) => orderRows.some((order) => order.id === id)));

    const settlementRows = (settlementResult.data ?? []) as unknown as SettlementRow[];
    setSettlements(settlementRows);
    const signed = await Promise.all(settlementRows.filter((row) => row.proof_file_path).map(async (row) => {
      const { data } = await supabase.storage.from(FILE_BUCKET).createSignedUrl(row.proof_file_path as string, 60 * 10);
      return [row.id, data?.signedUrl ?? row.proof_file_url ?? ""] as const;
    }));
    setSignedUrls(Object.fromEntries(signed));
  }

  useEffect(() => {
    void loadData();
  }, [settlementDate, selectedStaffId]);

  function toggleOrder(orderId: string) {
    setSelectedOrderIds((current) => current.includes(orderId) ? current.filter((id) => id !== orderId) : [...current, orderId]);
  }

  const selectedOrders = pendingOrders.filter((order) => selectedOrderIds.includes(order.id));
  const totalRequired = selectedOrders.reduce((sum, order) => sum + Number(order.financial_summary?.handover_remaining_amount ?? 0), 0);

  async function submitSettlement(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    const amount = Number(submittedAmount || 0);
    const staffId = role === "field_staff" ? userId : selectedStaffId;
    const selectedStaff = staff.find((item) => item.id === staffId);
    const targetBranchId = role === "field_staff" ? branchId : selectedStaff?.branch_id ?? branchId;

    if (!staffId) return setError("Vui lòng chọn nhân viên");
    if (selectedOrderIds.length === 0) return setError("Vui lòng chọn ít nhất một đơn hàng");
    if (!submittedAmount) return setError("Vui lòng nhập số tiền đã gửi");
    if (amount <= 0) return setError("Số tiền đã gửi phải lớn hơn 0");
    if (amount > totalRequired && role !== "admin") return setError("Số tiền gửi không được lớn hơn tổng cần nộp nếu không có xác nhận của admin");
    if (!proofFile) return setError("Vui lòng tải ảnh chuyển khoản/chứng từ");
    const validation = validateUploadFile(proofFile);
    if (validation) return setError(validation);

    setSaving(true);
    const { data: settlement, error: insertError } = await supabase.from("daily_handover_settlements").insert({
      branch_id: targetBranchId,
      staff_id: staffId,
      settlement_date: settlementDate,
      total_required_amount: totalRequired,
      submitted_amount: amount,
      payment_method: "Chuyển khoản",
      status: "Chờ admin xác nhận",
      note: note || null,
      created_by: userId,
    }).select("id, settlement_code, branch_id").single();

    if (insertError || !settlement) {
      setSaving(false);
      setError(insertError?.message ?? "Không thể tạo phiếu nộp tiền");
      return;
    }

    const allocations = allocateAmount(pendingOrders, selectedOrderIds, amount).map((item) => ({ ...item, settlement_id: settlement.id }));
    const linkResult = await supabase.from("daily_handover_settlement_orders").insert(allocations);
    if (linkResult.error) {
      setSaving(false);
      setError(linkResult.error.message);
      return;
    }

    const storageFileName = `${crypto.randomUUID()}-${sanitizeFileName(proofFile.name)}`;
    const filePath = `branch/${settlement.branch_id}/handover-settlements/${settlement.id}/proof/${storageFileName}`;
    const uploadResult = await supabase.storage.from(FILE_BUCKET).upload(filePath, proofFile, {
      cacheControl: "3600",
      upsert: false,
      contentType: proofFile.type,
    });
    if (uploadResult.error) {
      setSaving(false);
      setError(`Không thể tải chứng từ: ${uploadResult.error.message}`);
      return;
    }

    const { data: publicUrl } = supabase.storage.from(FILE_BUCKET).getPublicUrl(filePath);
    await supabase.from("daily_handover_settlements").update({
      proof_file_url: publicUrl.publicUrl,
      proof_file_path: filePath,
      proof_file_name: proofFile.name,
    }).eq("id", settlement.id);

    await createAdminNotification(supabase, {
      title: "Nhân viên gửi xác nhận nộp tiền",
      message: `${selectedStaff?.full_name ?? "Nhân viên"} đã gửi xác nhận nộp tiền ngày ${settlementDate}: ${formatMoney(amount)}`,
      notification_type: "daily_handover_created",
      entity_type: "daily_handover_settlement",
      entity_id: settlement.id,
      branch_id: settlement.branch_id,
      actor_id: userId,
      actor_role: role,
    });
    await writeAuditLog(supabase, {
      action: "daily_handover_created",
      entity_type: "daily_handover_settlement",
      entity_id: settlement.id,
      branch_id: settlement.branch_id,
      actor_id: userId,
      new_data: { submitted_amount: amount, total_required_amount: totalRequired, order_ids: selectedOrderIds },
    });

    setSaving(false);
    setMessage("Đã gửi xác nhận nộp tiền");
    setSubmittedAmount("");
    setProofFile(null);
    setNote("");
    setSelectedOrderIds([]);
    await loadData();
  }

  async function confirmSettlement(settlement: SettlementRow) {
    setSaving(true);
    setError("");
    const { data: links, error: linkError } = await supabase
      .from("daily_handover_settlement_orders")
      .select("*")
      .eq("settlement_id", settlement.id);

    if (linkError) {
      setSaving(false);
      setError(linkError.message);
      return;
    }

    const payments = ((links ?? []) as SettlementOrderRow[])
      .filter((link) => Number(link.allocated_amount ?? 0) > 0)
      .map((link) => ({
        order_id: link.order_id,
        branch_id: settlement.branch_id,
        staff_id: settlement.staff_id,
        amount: Number(link.allocated_amount ?? 0),
        payment_date: settlement.settlement_date,
        collection_method: settlement.payment_method,
        proof_file_url: settlement.proof_file_url,
        proof_file_path: settlement.proof_file_path,
        note: `Từ phiếu ${settlement.settlement_code}`,
        created_by: userId,
      }));

    if (payments.length > 0) {
      const paymentResult = await supabase.from("order_handover_payments").insert(payments);
      if (paymentResult.error) {
        setSaving(false);
        setError(paymentResult.error.message);
        return;
      }
    }

    await supabase.from("daily_handover_settlements").update({
      status: "Đã xác nhận",
      confirmed_by: userId,
      confirmed_at: new Date().toISOString(),
    }).eq("id", settlement.id);
    setSaving(false);
    setMessage("Đã xác nhận phiếu nộp tiền");
    await loadData();
  }

  async function rejectSettlement(settlement: SettlementRow) {
    const noteValue = adminNote[settlement.id]?.trim();
    if (!noteValue) {
      setError("Vui lòng nhập ghi chú admin khi từ chối");
      return;
    }
    setSaving(true);
    await supabase.from("daily_handover_settlements").update({
      status: "Từ chối",
      admin_note: noteValue,
      confirmed_by: userId,
      confirmed_at: new Date().toISOString(),
    }).eq("id", settlement.id);
    setSaving(false);
    setMessage("Đã từ chối phiếu nộp tiền");
    await loadData();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{role === "field_staff" ? "Nộp tiền của tôi" : "Nộp tiền trong ngày"}</h1>
        <p className="text-sm text-muted-foreground">Chốt một lần số tiền nhân viên đã thu và gửi chứng từ chuyển khoản trong ngày.</p>
      </div>

      {error ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {message ? <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p> : null}

      <Card>
        <form onSubmit={submitSettlement} className="grid gap-4 lg:grid-cols-4">
          <label className="space-y-2">
            <span className="text-sm font-medium">Ngày nộp</span>
            <Input type="date" value={settlementDate} onChange={(event) => setSettlementDate(event.target.value)} />
          </label>
          {role !== "field_staff" ? (
            <label className="space-y-2">
              <span className="text-sm font-medium">Nhân viên</span>
              <Select value={selectedStaffId} onChange={(event) => setSelectedStaffId(event.target.value)}>
                <option value="">Chọn nhân viên</option>
                {staff.map((item) => <option key={item.id} value={item.id}>{item.full_name} - {item.branches?.name ?? ""}</option>)}
              </Select>
            </label>
          ) : null}
          <label className="space-y-2">
            <span className="text-sm font-medium">Số tiền đã gửi</span>
            <Input type="number" min="1" value={submittedAmount} onChange={(event) => setSubmittedAmount(event.target.value)} />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-medium">Ảnh chuyển khoản / chứng từ nộp tiền</span>
            <Input type="file" accept={ACCEPTED_FILE_TYPES.join(",")} onChange={(event) => setProofFile(event.target.files?.[0] ?? null)} />
          </label>
          <label className="space-y-2 lg:col-span-4">
            <span className="text-sm font-medium">Ghi chú</span>
            <Textarea value={note} onChange={(event) => setNote(event.target.value)} />
          </label>
          <div className="lg:col-span-4">
            <div className="mb-3 text-sm text-muted-foreground">Tổng cần nộp đã chọn: <strong>{formatMoney(totalRequired)}</strong></div>
            <Button disabled={saving || selectedOrderIds.length === 0}>
              <Send className="h-4 w-4" />
              {saving ? "Đang gửi..." : "Gửi xác nhận nộp tiền"}
            </Button>
          </div>
        </form>
      </Card>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Đơn hàng còn phải nộp</h2>
          <Button className="bg-slate-900" onClick={() => void loadData()}><RefreshCcw className="h-4 w-4" />Tải lại</Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead><tr className="border-b text-left text-muted-foreground"><th className="py-3">Chọn</th><th>Mã đơn</th><th>Ngày đơn</th><th>Chi nhánh</th><th className="text-right">Còn phải nộp</th></tr></thead>
            <tbody>
              {loading ? (
                <tr><td className="py-8 text-center text-muted-foreground" colSpan={5}>Đang tải đơn cần nộp...</td></tr>
              ) : pendingOrders.length === 0 ? (
                <tr><td className="py-8 text-center text-muted-foreground" colSpan={5}>Không có đơn cần nộp trong ngày này</td></tr>
              ) : pendingOrders.map((order) => (
                <tr key={order.id} className="border-b">
                  <td className="py-3"><input type="checkbox" checked={selectedOrderIds.includes(order.id)} onChange={() => toggleOrder(order.id)} /></td>
                  <td className="font-medium">{order.order_code}</td>
                  <td>{formatDate(order.order_date)}</td>
                  <td>{order.branches?.name ?? "-"}</td>
                  <td className="text-right">{formatMoney(order.financial_summary?.handover_remaining_amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <h2 className="mb-4 font-semibold">Danh sách phiếu nộp tiền</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-3">Mã phiếu</th>
                <th>Ngày nộp</th>
                <th>Nhân viên</th>
                <th>Chi nhánh</th>
                <th className="text-right">Tổng cần nộp</th>
                <th className="text-right">Đã gửi</th>
                <th className="text-right">Còn thiếu</th>
                <th>Trạng thái</th>
                <th>Chứng từ</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {settlements.length === 0 ? (
                <tr><td className="py-8 text-center text-muted-foreground" colSpan={10}>Chưa có phiếu nộp tiền</td></tr>
              ) : settlements.map((settlement) => (
                <tr key={settlement.id} className="border-b">
                  <td className="py-3 font-medium">{settlement.settlement_code}</td>
                  <td>{formatDate(settlement.settlement_date)}</td>
                  <td>{settlement.staff?.full_name ?? "-"}</td>
                  <td>{settlement.branches?.name ?? "-"}</td>
                  <td className="text-right">{formatMoney(settlement.total_required_amount)}</td>
                  <td className="text-right">{formatMoney(settlement.submitted_amount)}</td>
                  <td className="text-right">{formatMoney(settlement.remaining_amount)}</td>
                  <td><Badge>{settlement.status}</Badge></td>
                  <td>{settlement.proof_file_path ? <a className="inline-flex items-center gap-1 text-primary hover:underline" href={signedUrls[settlement.id] ?? settlement.proof_file_url ?? ""} target="_blank" rel="noreferrer">Xem chứng từ <ExternalLink className="h-3.5 w-3.5" /></a> : "-"}</td>
                  <td>
                    {role === "admin" && settlement.status === "Chờ admin xác nhận" ? (
                      <div className="flex min-w-[280px] items-center gap-2">
                        <Input placeholder="Ghi chú khi từ chối" value={adminNote[settlement.id] ?? ""} onChange={(event) => setAdminNote((current) => ({ ...current, [settlement.id]: event.target.value }))} />
                        <Button className="h-8 bg-emerald-600 px-3" onClick={() => void confirmSettlement(settlement)}><CheckCircle2 className="h-3.5 w-3.5" />Xác nhận</Button>
                        <Button className="h-8 bg-red-600 px-3" onClick={() => void rejectSettlement(settlement)}><XCircle className="h-3.5 w-3.5" />Từ chối</Button>
                      </div>
                    ) : settlement.admin_note ? <span className="text-xs text-muted-foreground">{settlement.admin_note}</span> : "-"}
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
