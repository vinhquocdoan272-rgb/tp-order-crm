"use client";

import { useEffect, useMemo, useState } from "react";
import { Save } from "lucide-react";
import { COLLECTION_METHODS, COLLECTED_BY_LABELS } from "@/lib/constants/app";
import { createClient } from "@/lib/supabase/browser";
import type { CollectedByType } from "@/lib/constants/app";
import type { OrderFinancialSummary, OrderHandoverPayment, UserRole } from "@/lib/types/database";
import { formatDate, formatMoney } from "@/lib/utils/format";
import { handoverPaymentSchema } from "@/lib/validations/schemas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type PaymentRow = OrderHandoverPayment & {
  staff?: { full_name: string | null } | null;
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

export function OrderHandoverPanel({
  orderId,
  branchId,
  role,
}: {
  orderId: string;
  branchId: string | null;
  role: UserRole;
}) {
  const supabase = useMemo(() => createClient(), []);
  const canAdd = role === "admin" || role === "branch_manager" || role === "field_staff";
  const [summary, setSummary] = useState<OrderFinancialSummary>(emptySummary(orderId, branchId));
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState("Tiền mặt");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadData() {
    setLoading(true);
    setError("");

    const [summaryResult, paymentsResult] = await Promise.all([
      supabase.from("order_financial_summary").select("*").eq("order_id", orderId).maybeSingle(),
      supabase
        .from("order_handover_payments")
        .select("*, staff:profiles!order_handover_payments_staff_id_fkey(full_name)")
        .eq("order_id", orderId)
        .order("payment_date", { ascending: false }),
    ]);

    setLoading(false);

    if (summaryResult.error && summaryResult.error.code !== "PGRST116") {
      setError(summaryResult.error.message);
      return;
    }
    if (paymentsResult.error) {
      setError(paymentsResult.error.message);
      return;
    }

    setSummary((summaryResult.data as unknown as OrderFinancialSummary | null) ?? emptySummary(orderId, branchId));
    setPayments((paymentsResult.data ?? []) as unknown as PaymentRow[]);
  }

  useEffect(() => {
    void loadData();
  }, []);

  async function savePayment(event: React.FormEvent<HTMLFormElement>) {
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
      staff_id: summary.collected_by_staff_id ?? undefined,
      amount: Number(amount || 0),
      payment_date: paymentDate,
      collection_method: method,
      note: note || undefined,
      created_by: user.id,
    };

    const validation = handoverPaymentSchema.safeParse(payload);
    if (!validation.success) {
      setSaving(false);
      setError(validation.error.issues[0]?.message ?? "Dữ liệu nộp tiền chưa hợp lệ");
      return;
    }

    const insertResult = await supabase.from("order_handover_payments").insert({
      ...validation.data,
      note: validation.data.note || null,
    });

    setSaving(false);

    if (insertResult.error) {
      setError(insertResult.error.message);
      return;
    }

    setAmount("");
    setNote("");
    setMessage("Đã ghi nhận khoản nộp tiền");
    await loadData();
  }

  const collectorLabel = COLLECTED_BY_LABELS[(summary.collected_by_type ?? "store") as CollectedByType] ?? "Cửa hàng thu";
  const ownerFrontedExpenses = Number(summary.store_paid_expenses ?? 0) + Number(summary.owner_paid_expenses ?? 0);

  return (
    <Card>
      <h2 className="mb-4 font-semibold">Nộp tiền về cửa hàng/chủ</h2>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Info label="Người thu tiền" value={collectorLabel} />
        <Info label="Nhân viên thu tiền" value={summary.collected_by_staff_id ? "Nhân viên được chọn trên đơn" : "-"} />
        <Info label="Hình thức thu" value={summary.collection_method ?? "Tiền mặt"} />
        <Info label="Số tiền khách đã trả" value={formatMoney(summary.paid_amount)} />
        <Info label="Tổng chi phí" value={formatMoney(summary.total_expenses)} />
        <Info label="Nhân viên đã ứng" value={formatMoney(summary.staff_paid_expenses)} />
        <Info label="Cửa hàng/chủ đã ứng" value={formatMoney(ownerFrontedExpenses)} />
        <Info label="Lợi nhuận sau chi" value={formatMoney(summary.net_profit)} />
        <Info label="Chủ/cửa hàng hưởng 50%" value={formatMoney(summary.owner_profit_share)} />
        <Info label="Cửa hàng/chủ cần thu hồi vật tư" value={formatMoney(ownerFrontedExpenses)} />
        <Info label="Số tiền cần nộp chủ" value={formatMoney(summary.handover_required_amount)} />
        <Info label="Đã nộp chủ" value={formatMoney(summary.handover_paid_amount)} />
        <Info label="Còn phải nộp chủ" value={formatMoney(summary.handover_remaining_amount)} />
        <div className="rounded-md border bg-white p-3">
          <div className="text-xs text-muted-foreground">Trạng thái nộp tiền</div>
          <div className="mt-1"><Badge>{summary.handover_status}</Badge></div>
        </div>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        Số tiền cần nộp chủ = phần lời của chủ/cửa hàng + chi phí vật tư/cửa hàng/chủ đã ứng.
      </p>

      {canAdd && summary.handover_status !== "Không cần nộp" ? (
        <form onSubmit={savePayment} className="mt-6 grid gap-3 md:grid-cols-[180px_180px_180px_1fr_auto]">
          <Input type="number" min="1" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Số tiền nộp" />
          <Input type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} />
          <Select value={method} onChange={(event) => setMethod(event.target.value)}>
            {COLLECTION_METHODS.map((item) => <option key={item} value={item}>{item}</option>)}
          </Select>
          <Textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ghi chú" />
          <Button disabled={saving}>
            <Save className="h-4 w-4" />
            {saving ? "Đang lưu..." : "Ghi nhận"}
          </Button>
        </form>
      ) : null}

      {message ? <p className="mt-4 rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p> : null}
      {error ? <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-3">Ngày nộp</th>
              <th>Nhân viên</th>
              <th>Hình thức</th>
              <th className="text-right">Số tiền</th>
              <th>Ghi chú</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="py-8 text-center text-muted-foreground" colSpan={5}>Đang tải lịch sử nộp tiền...</td></tr>
            ) : payments.length === 0 ? (
              <tr><td className="py-8 text-center text-muted-foreground" colSpan={5}>Chưa có khoản nộp tiền</td></tr>
            ) : payments.map((payment) => (
              <tr key={payment.id} className="border-b">
                <td className="py-3">{formatDate(payment.payment_date)}</td>
                <td>{payment.staff?.full_name ?? "-"}</td>
                <td>{payment.collection_method ?? "-"}</td>
                <td className="text-right">{formatMoney(payment.amount)}</td>
                <td>{payment.note ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-white p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-semibold">{value}</div>
    </div>
  );
}
