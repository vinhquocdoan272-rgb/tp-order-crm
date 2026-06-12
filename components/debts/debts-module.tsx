"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, RefreshCcw, Save } from "lucide-react";
import type { UserRole } from "@/lib/types/database";
import { createClient } from "@/lib/supabase/browser";
import { exportToExcel } from "@/lib/export/excel";
import { formatDate, formatMoney } from "@/lib/utils/format";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type DebtOrder = {
  id: string;
  order_code: string;
  branch_id: string | null;
  total_amount: number | string | null;
  paid_amount: number | string | null;
  debt_amount: number | string | null;
  order_date: string | null;
  customers?: { name: string | null; phone: string | null } | null;
  branches?: { name: string | null } | null;
};

export function DebtsModule({ role }: { role: UserRole }) {
  const supabase = useMemo(() => createClient(), []);
  const canUpdatePaidAmount = role === "admin" || role === "branch_manager";
  const [orders, setOrders] = useState<DebtOrder[]>([]);
  const [paidAmounts, setPaidAmounts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function loadOrders() {
    setLoading(true);
    setError("");
    const { data, error: loadError } = await supabase
      .from("orders")
      .select("id, order_code, branch_id, total_amount, paid_amount, debt_amount, order_date, customers(name, phone), branches(name)")
      .gt("debt_amount", 0)
      .order("order_date", { ascending: false });

    setLoading(false);

    if (loadError) {
      setError(loadError.message);
      return;
    }

    const rows = (data ?? []) as unknown as DebtOrder[];
    setOrders(rows);
    setPaidAmounts(Object.fromEntries(rows.map((order) => [order.id, String(order.paid_amount ?? 0)])));
  }

  useEffect(() => {
    void loadOrders();
  }, []);

  const totalDebt = orders.reduce((sum, order) => {
    const paid = Number(paidAmounts[order.id] ?? order.paid_amount ?? 0);
    const debt = Math.max(Number(order.total_amount ?? 0) - paid, 0);
    return sum + debt;
  }, 0);

  async function exportDebts() {
    await exportToExcel("cong-no", "Công nợ", [
      { header: "Mã đơn", key: "Mã đơn", width: 16 },
      { header: "Khách hàng", key: "Khách hàng", width: 28 },
      { header: "Số điện thoại", key: "Số điện thoại", width: 18 },
      { header: "Chi nhánh", key: "Chi nhánh", width: 32 },
      { header: "Tổng tiền", key: "Tổng tiền", money: true, width: 18 },
      { header: "Đã thu", key: "Đã thu", money: true, width: 18 },
      { header: "Còn nợ", key: "Còn nợ", money: true, width: 18 },
      { header: "Ngày đơn", key: "Ngày đơn", width: 14 },
    ], orders.map((order) => {
      const paid = Number(paidAmounts[order.id] ?? order.paid_amount ?? 0);
      return {
        "Mã đơn": order.order_code,
        "Khách hàng": order.customers?.name ?? "",
        "Số điện thoại": order.customers?.phone ?? "",
        "Chi nhánh": order.branches?.name ?? "",
        "Tổng tiền": Number(order.total_amount ?? 0),
        "Đã thu": paid,
        "Còn nợ": Math.max(Number(order.total_amount ?? 0) - paid, 0),
        "Ngày đơn": order.order_date ?? "",
      };
    }));
  }

  async function updatePaidAmount(order: DebtOrder) {
    if (!canUpdatePaidAmount) return;
    setError("");
    setMessage("");
    const paidAmount = Number(paidAmounts[order.id] ?? 0);
    const totalAmount = Number(order.total_amount ?? 0);

    if (!Number.isFinite(paidAmount) || paidAmount < 0) {
      setError("Số tiền đã thu phải lớn hơn hoặc bằng 0");
      return;
    }

    if (paidAmount > totalAmount) {
      setError("Số tiền đã thu không được vượt quá tổng tiền");
      return;
    }

    setSavingId(order.id);
    const { error: updateError } = await supabase.from("orders").update({ paid_amount: paidAmount }).eq("id", order.id);
    setSavingId("");

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setMessage(`Đã cập nhật thanh toán cho đơn ${order.order_code}`);
    await loadOrders();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Công nợ</h1>
          <p className="text-sm text-muted-foreground">Danh sách đơn hàng còn nợ và cập nhật số tiền đã thu.</p>
        </div>
        <div className="flex gap-2">
          <Button className="bg-slate-900" onClick={() => void loadOrders()}>
            <RefreshCcw className="h-4 w-4" />
            Tải lại
          </Button>
          <Button disabled={orders.length === 0} onClick={() => void exportDebts()}>
            <Download className="h-4 w-4" />
            Xuất Excel
          </Button>
        </div>
      </div>

      <Card>
        <div className="text-sm text-muted-foreground">Tổng công nợ</div>
        <div className="mt-2 text-3xl font-semibold">{formatMoney(totalDebt)}</div>
      </Card>

      {error ? <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {message ? <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p> : null}

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-3">Mã đơn</th>
                <th>Khách hàng</th>
                <th>Số điện thoại</th>
                <th>Chi nhánh</th>
                <th className="text-right">Tổng tiền</th>
                <th className="text-right">Đã thu</th>
                <th className="text-right">Còn nợ</th>
                <th>Ngày đơn</th>
                <th className="text-right">Cập nhật</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td className="py-8 text-center text-muted-foreground" colSpan={9}>Đang tải danh sách công nợ...</td></tr>
              ) : orders.length === 0 ? (
                <tr><td className="py-8 text-center text-muted-foreground" colSpan={9}>Không có đơn hàng còn nợ</td></tr>
              ) : orders.map((order) => {
                const paid = Number(paidAmounts[order.id] ?? order.paid_amount ?? 0);
                const debt = Math.max(Number(order.total_amount ?? 0) - paid, 0);
                return (
                  <tr key={order.id} className="border-b">
                    <td className="py-3 font-medium">{order.order_code}</td>
                    <td>{order.customers?.name ?? "-"}</td>
                    <td>{order.customers?.phone ?? "-"}</td>
                    <td>{order.branches?.name ?? "-"}</td>
                    <td className="text-right">{formatMoney(order.total_amount)}</td>
                    <td className="text-right">
                      {canUpdatePaidAmount ? (
                        <Input className="ml-auto w-32 text-right" type="number" min="0" value={paidAmounts[order.id] ?? "0"} onChange={(event) => setPaidAmounts((current) => ({ ...current, [order.id]: event.target.value }))} />
                      ) : formatMoney(order.paid_amount)}
                    </td>
                    <td className="text-right font-medium">{formatMoney(debt)}</td>
                    <td>{formatDate(order.order_date)}</td>
                    <td className="text-right">
                      {canUpdatePaidAmount ? (
                        <Button className="h-8 px-3" disabled={savingId === order.id} onClick={() => void updatePaidAmount(order)}>
                          <Save className="h-3.5 w-3.5" />
                          {savingId === order.id ? "Đang lưu" : "Lưu"}
                        </Button>
                      ) : "-"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
