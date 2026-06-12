"use client";

import { useEffect, useMemo, useState } from "react";
import { addDays, format, startOfMonth, subDays } from "date-fns";
import { RefreshCcw } from "lucide-react";
import type { UserRole } from "@/lib/types/database";
import { createClient } from "@/lib/supabase/browser";
import { formatMoney } from "@/lib/utils/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

type BranchOption = { id: string; name: string };

type StaffLeaderboardRow = {
  staff_id: string;
  staff_name: string | null;
  branch_id: string | null;
  branch_name: string | null;
  completed_orders_count: number | string | null;
  total_paid_amount: number | string | null;
  total_expenses: number | string | null;
  net_revenue_after_expenses: number | string | null;
};

type RangeKey = "month" | "7days" | "30days" | "custom";

function defaultDates(range: RangeKey) {
  const today = new Date();
  if (range === "7days") return { from: format(subDays(today, 6), "yyyy-MM-dd"), to: format(today, "yyyy-MM-dd") };
  if (range === "30days") return { from: format(subDays(today, 29), "yyyy-MM-dd"), to: format(today, "yyyy-MM-dd") };
  return { from: format(startOfMonth(today), "yyyy-MM-dd"), to: format(today, "yyyy-MM-dd") };
}

function rankLabel(index: number) {
  if (index < 3) return <Badge>#{index + 1}</Badge>;
  return <span className="font-medium">#{index + 1}</span>;
}

export function StaffLeaderboard({ role, branchId, branches }: { role: UserRole; branchId: string | null; branches: BranchOption[] }) {
  const supabase = useMemo(() => createClient(), []);
  const [range, setRange] = useState<RangeKey>("month");
  const initialDates = defaultDates("month");
  const [fromDate, setFromDate] = useState(initialDates.from);
  const [toDate, setToDate] = useState(initialDates.to);
  const [selectedBranchId, setSelectedBranchId] = useState(role === "admin" ? "" : branchId ?? "");
  const [rows, setRows] = useState<StaffLeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadLeaderboard() {
    setLoading(true);
    setError("");
    const endDate = toDate || format(new Date(), "yyyy-MM-dd");
    const startDate = fromDate || format(addDays(new Date(endDate), -29), "yyyy-MM-dd");
    const filterBranchId = role === "admin" ? selectedBranchId || null : branchId;

    const { data, error: rpcError } = await supabase.rpc("get_staff_leaderboard", {
      start_date: startDate,
      end_date: endDate,
      filter_branch_id: filterBranchId,
    });

    setLoading(false);
    if (rpcError) {
      setError(`Không thể tải bảng xếp hạng nhân viên: ${rpcError.message}`);
      return;
    }

    setRows(((data ?? []) as StaffLeaderboardRow[]).slice(0, 10));
  }

  useEffect(() => {
    void loadLeaderboard();
  }, [fromDate, toDate, selectedBranchId]);

  function changeRange(nextRange: RangeKey) {
    setRange(nextRange);
    if (nextRange !== "custom") {
      const dates = defaultDates(nextRange);
      setFromDate(dates.from);
      setToDate(dates.to);
    }
  }

  const canSeeDetails = role === "admin" || role === "branch_manager";

  return (
    <Card>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="font-semibold">BXH nhân viên tháng này</h2>
          <p className="text-sm text-muted-foreground">Xếp hạng theo doanh thu sau chi phí từ các đơn hoàn tất.</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:flex">
          <Select value={range} onChange={(event) => changeRange(event.target.value as RangeKey)}>
            <option value="month">Tháng này</option>
            <option value="7days">7 ngày gần nhất</option>
            <option value="30days">30 ngày gần nhất</option>
            <option value="custom">Tùy chọn ngày</option>
          </Select>
          <Input type="date" value={fromDate} disabled={range !== "custom"} onChange={(event) => setFromDate(event.target.value)} />
          <Input type="date" value={toDate} disabled={range !== "custom"} onChange={(event) => setToDate(event.target.value)} />
          {role === "admin" ? (
            <Select value={selectedBranchId} onChange={(event) => setSelectedBranchId(event.target.value)}>
              <option value="">Tất cả chi nhánh</option>
              {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </Select>
          ) : null}
          <Button type="button" className="bg-slate-900" onClick={() => void loadLeaderboard()}>
            <RefreshCcw className="h-4 w-4" />
            Tải lại
          </Button>
        </div>
      </div>

      {error ? <p className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-3">Hạng</th>
              <th>Nhân viên</th>
              <th>Chi nhánh</th>
              <th className="text-right">Số đơn hoàn tất</th>
              {canSeeDetails ? <th className="text-right">Doanh thu đã thu</th> : null}
              {canSeeDetails ? <th className="text-right">Chi phí phát sinh</th> : null}
              <th className="text-right">Doanh thu sau chi phí</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="py-8 text-center text-muted-foreground" colSpan={canSeeDetails ? 7 : 5}>Đang tải bảng xếp hạng...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td className="py-8 text-center text-muted-foreground" colSpan={canSeeDetails ? 7 : 5}>Chưa có dữ liệu xếp hạng trong kỳ này.</td></tr>
            ) : rows.map((row, index) => (
              <tr key={row.staff_id} className="border-b">
                <td className="py-3">{rankLabel(index)}</td>
                <td className="font-medium">{row.staff_name ?? "-"}</td>
                <td>{row.branch_name ?? "-"}</td>
                <td className="text-right">{Number(row.completed_orders_count ?? 0)}</td>
                {canSeeDetails ? <td className="text-right">{formatMoney(row.total_paid_amount)}</td> : null}
                {canSeeDetails ? <td className="text-right">{formatMoney(row.total_expenses)}</td> : null}
                <td className="text-right font-semibold">{formatMoney(row.net_revenue_after_expenses)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
