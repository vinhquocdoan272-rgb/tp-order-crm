import { format, subDays } from "date-fns";
import { AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DashboardCharts } from "@/components/dashboard/charts";
import { StaffLeaderboard } from "@/components/dashboard/staff-leaderboard";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatMoney } from "@/lib/utils/format";
import { isValidRole } from "@/lib/auth/roles";
import type { OrderFinancialSummary } from "@/lib/types/database";

export const dynamic = "force-dynamic";

type DashboardOrder = {
  id: string;
  order_code: string;
  branch_id: string | null;
  assigned_staff_id: string | null;
  status: string;
  payment_status: string;
  total_amount: number | string | null;
  paid_amount: number | string | null;
  debt_amount: number | string | null;
  order_date: string | null;
  created_at: string | null;
  customers?: { name: string | null; phone?: string | null } | null;
  branches?: { name: string | null } | null;
  financial_summary?: OrderFinancialSummary | null;
};

type BranchOption = { id: string; name: string };
type DailySettlement = {
  id: string;
  branch_id: string | null;
  staff_id: string | null;
  status: string;
  submitted_amount: number | string | null;
  remaining_amount: number | string | null;
};

function sameDate(value: string | null, date: string) {
  return Boolean(value && value.slice(0, 10) === date);
}

function monthKey(value: string | null) {
  return value ? value.slice(0, 7) : "";
}

function isDebtOrder(order: DashboardOrder) {
  return Number(order.debt_amount ?? 0) > 0 || order.payment_status === "Còn nợ";
}

function handoverRemaining(order: DashboardOrder) {
  return Number(order.financial_summary?.handover_remaining_amount ?? 0);
}

function handoverStatus(order: DashboardOrder) {
  return order.financial_summary?.handover_status ?? "Không cần nộp";
}

function groupSum(rows: DashboardOrder[], keyGetter: (row: DashboardOrder) => string) {
  const groups = new Map<string, number>();
  rows.forEach((row) => {
    const key = keyGetter(row) || "Chưa xác định";
    groups.set(key, (groups.get(key) ?? 0) + Number(row.paid_amount ?? 0));
  });
  return [...groups.entries()].map(([name, value]) => ({ name, value }));
}

function groupCount(rows: DashboardOrder[], keyGetter: (row: DashboardOrder) => string) {
  const groups = new Map<string, number>();
  rows.forEach((row) => {
    const key = keyGetter(row) || "Chưa xác định";
    groups.set(key, (groups.get(key) ?? 0) + 1);
  });
  return [...groups.entries()].map(([name, value]) => ({ name, value }));
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return <DashboardError message="Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại." />;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role, branch_id, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    return <DashboardError message="Không thể tải thông tin phân quyền của tài khoản." />;
  }

  if (!profile?.is_active || !isValidRole(profile.role)) {
    return <DashboardError message="Tài khoản chưa được phân quyền. Vui lòng liên hệ quản trị viên." />;
  }

  let query = supabase
    .from("orders")
    .select("id, order_code, branch_id, assigned_staff_id, status, payment_status, total_amount, paid_amount, debt_amount, order_date, created_at, customers(name, phone), branches(name)")
    .order("created_at", { ascending: false });

  if (profile.role === "branch_manager" && profile.branch_id) query = query.eq("branch_id", profile.branch_id);
  if (profile.role === "field_staff") query = query.eq("assigned_staff_id", user.id);

  const [{ data, error }, summaryResult, branchResult, settlementResult] = await Promise.all([
    query,
    supabase.from("order_financial_summary").select("*"),
    supabase.from("branches").select("id, name").order("name"),
    supabase.from("daily_handover_settlements").select("id, branch_id, staff_id, status, submitted_amount, remaining_amount"),
  ]);

  if (error) {
    return <DashboardError message="Không thể tải dữ liệu dashboard từ Supabase." detail={error.message} />;
  }

  const summaryMissing = summaryResult.error?.message?.includes("order_financial_summary");
  const summaryRows = summaryMissing ? [] : ((summaryResult.data ?? []) as unknown as OrderFinancialSummary[]);
  const summaryByOrderId = new Map(summaryRows.map((summary) => [summary.order_id, summary]));
  const branches = (branchResult.data ?? []) as BranchOption[];
  const settlements = ((settlementResult.data ?? []) as DailySettlement[]).filter((settlement) => {
    if (profile.role === "branch_manager") return settlement.branch_id === profile.branch_id;
    if (profile.role === "field_staff") return settlement.staff_id === user.id;
    return true;
  });
  const orders = ((data ?? []) as unknown as DashboardOrder[]).map((order) => ({
    ...order,
    financial_summary: summaryByOrderId.get(order.id) ?? null,
  }));

  const today = format(new Date(), "yyyy-MM-dd");
  const currentMonth = format(new Date(), "yyyy-MM");
  const todayOrders = orders.filter((order) => sameDate(order.order_date, today));
  const monthOrders = orders.filter((order) => monthKey(order.order_date) === currentMonth);
  const handoverDebtOrders = orders.filter((order) => handoverRemaining(order) > 0);
  const pendingSettlements = settlements.filter((settlement) => settlement.status === "Chờ admin xác nhận");

  const cards = [
    { label: "Tổng đơn hôm nay", value: todayOrders.length.toString() },
    { label: "Doanh thu hôm nay", value: formatMoney(todayOrders.reduce((sum, order) => sum + Number(order.paid_amount ?? 0), 0)) },
    { label: "Tổng đơn trong tháng", value: monthOrders.length.toString() },
    { label: "Doanh thu tháng này", value: formatMoney(monthOrders.reduce((sum, order) => sum + Number(order.paid_amount ?? 0), 0)) },
    { label: "Tổng công nợ", value: formatMoney(orders.reduce((sum, order) => sum + Number(order.debt_amount ?? 0), 0)) },
    { label: "Đơn đang xử lý", value: orders.filter((order) => order.status === "Đang xử lý").length.toString() },
    { label: "Đơn hoàn tất", value: orders.filter((order) => order.status === "Hoàn tất").length.toString() },
    { label: "Đơn còn nợ", value: orders.filter(isDebtOrder).length.toString() },
    { label: "Tiền nhân viên chưa nộp", value: formatMoney(handoverDebtOrders.reduce((sum, order) => sum + handoverRemaining(order), 0)) },
    { label: "Số đơn chưa nộp tiền", value: orders.filter((order) => handoverStatus(order) === "Chưa nộp").length.toString() },
    { label: "Số đơn nộp một phần", value: orders.filter((order) => handoverStatus(order) === "Nộp một phần").length.toString() },
    { label: profile.role === "field_staff" ? "Phiếu nộp tiền đang chờ xác nhận" : "Phiếu nộp tiền chờ xác nhận", value: pendingSettlements.length.toString() },
    { label: profile.role === "field_staff" ? "Tiền tôi còn phải nộp" : "Tổng tiền nhân viên chờ xác nhận", value: formatMoney(pendingSettlements.reduce((sum, settlement) => sum + Number(settlement.submitted_amount ?? 0), 0)) },
  ];

  const branchRevenue = groupSum(orders, (order) => order.branches?.name?.replace("Tin Học Tấn Phát - ", "") ?? "");
  const statusCounts = groupCount(orders, (order) => order.status);
  const sevenDays = Array.from({ length: 7 }).map((_, index) => {
    const date = subDays(new Date(), 6 - index);
    const key = format(date, "yyyy-MM-dd");
    return {
      name: format(date, "dd/MM"),
      value: orders.filter((order) => sameDate(order.order_date, key)).reduce((sum, order) => sum + Number(order.paid_amount ?? 0), 0),
    };
  });

  const description =
    profile.role === "field_staff"
      ? "Tóm tắt các đơn hàng được giao cho bạn."
      : profile.role === "branch_manager"
        ? "Theo dõi đơn hàng, doanh thu, công nợ và tiền nhân viên chưa nộp của chi nhánh."
        : "Theo dõi đơn hàng, doanh thu, công nợ và tiền nhân viên chưa nộp toàn hệ thống.";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Tổng quan</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.label}>
            <div className="text-sm text-muted-foreground">{card.label}</div>
            <div className="mt-2 text-2xl font-semibold">{card.value}</div>
          </Card>
        ))}
      </div>

      {orders.length === 0 ? (
        <Card className="py-10 text-center">
          <h2 className="font-semibold">Chưa có dữ liệu đơn hàng</h2>
          <p className="mt-1 text-sm text-muted-foreground">Dashboard sẽ hiển thị số liệu khi có đơn hàng phù hợp với quyền truy cập của bạn.</p>
        </Card>
      ) : (
        <>
          <DashboardCharts branchRevenue={branchRevenue} statusCounts={statusCounts} sevenDays={sevenDays} />
          <Card>
            <h2 className="mb-4 font-semibold">Đơn mới nhất</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-3">Mã đơn</th>
                    <th>Khách hàng</th>
                    <th>Chi nhánh</th>
                    <th>Trạng thái</th>
                    <th>Nộp tiền</th>
                    <th className="text-right">Tổng tiền</th>
                    <th className="text-right">Ngày tạo</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.slice(0, 10).map((order) => (
                    <tr key={order.id} className="border-b">
                      <td className="py-3 font-medium">{order.order_code}</td>
                      <td>{order.customers?.name ?? "-"}</td>
                      <td>{order.branches?.name ?? "-"}</td>
                      <td><Badge>{order.status}</Badge></td>
                      <td><Badge>{handoverStatus(order)}</Badge></td>
                      <td className="text-right">{formatMoney(order.total_amount)}</td>
                      <td className="text-right">{formatDate(order.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      <StaffLeaderboard role={profile.role} branchId={profile.branch_id} branches={branches} />
    </div>
  );
}

function DashboardError({ message, detail }: { message: string; detail?: string }) {
  return (
    <Card className="flex items-start gap-3 border-red-200 bg-red-50 text-red-800">
      <AlertCircle className="mt-0.5 h-5 w-5" />
      <div>
        <h1 className="font-semibold">Không thể hiển thị dashboard</h1>
        <p className="mt-1 text-sm">{message}</p>
        {detail ? <p className="mt-2 text-xs text-red-700">{detail}</p> : null}
      </div>
    </Card>
  );
}
