import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ROLE_LABELS } from "@/lib/constants/app";
import { isValidRole } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatMoney } from "@/lib/utils/format";
import type { UserRole } from "@/lib/types/database";

export const dynamic = "force-dynamic";

type CustomerDetail = {
  id: string;
  customer_code: string;
  name: string;
  phone: string;
  address: string | null;
  customer_type: string;
  note: string | null;
  created_at: string;
  branches?: { name: string | null } | null;
  assigned_staff?: { full_name: string | null; role: UserRole | null } | null;
};

type CustomerOrder = {
  id: string;
  order_code: string;
  service_type: string;
  status: string;
  payment_status: string;
  total_amount: number | string | null;
  paid_amount: number | string | null;
  debt_amount: number | string | null;
  order_date: string | null;
  created_at: string;
};

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.is_active || !isValidRole(profile.role)) {
    redirect("/login?error=unassigned");
  }

  const [{ data: customer, error: customerError }, { data: orders }] = await Promise.all([
    supabase
      .from("customers")
      .select("*, branches(name), assigned_staff:profiles!customers_assigned_staff_id_fkey(full_name, role)")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("orders")
      .select("id, order_code, service_type, status, payment_status, total_amount, paid_amount, debt_amount, order_date, created_at")
      .eq("customer_id", id)
      .order("created_at", { ascending: false }),
  ]);

  if (customerError) {
    return (
      <Card className="border-red-200 bg-red-50 text-red-800">
        <h1 className="font-semibold">Không thể tải khách hàng</h1>
        <p className="mt-1 text-sm">{customerError.message}</p>
      </Card>
    );
  }

  if (!customer) notFound();

  const customerRow = customer as CustomerDetail;
  const orderRows = (orders ?? []) as CustomerOrder[];
  const totalRevenue = orderRows.reduce((sum, order) => sum + Number(order.paid_amount ?? 0), 0);
  const totalDebt = orderRows.reduce((sum, order) => sum + Number(order.debt_amount ?? 0), 0);
  const lastOrderDate = orderRows.reduce<string | null>((latest, order) => {
    if (!order.order_date) return latest;
    if (!latest || order.order_date > latest) return order.order_date;
    return latest;
  }, null);

  const assignedStaffLabel = customerRow.assigned_staff?.full_name
    ? `${customerRow.assigned_staff.full_name}${customerRow.assigned_staff.role ? ` - ${ROLE_LABELS[customerRow.assigned_staff.role]}` : ""}`
    : "Chưa giao";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{customerRow.name}</h1>
          <p className="text-sm text-muted-foreground">Chi tiết khách hàng {customerRow.customer_code}</p>
        </div>
        <Link className="inline-flex h-10 items-center justify-center rounded-md bg-slate-900 px-4 text-sm font-medium text-white" href="/customers">
          Quay lại danh sách
        </Link>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <h2 className="mb-4 font-semibold">Thông tin khách hàng</h2>
          <div className="grid gap-3 text-sm md:grid-cols-2">
            <p><span className="text-muted-foreground">Mã KH:</span> {customerRow.customer_code}</p>
            <p><span className="text-muted-foreground">Loại khách:</span> <Badge>{customerRow.customer_type}</Badge></p>
            <p><span className="text-muted-foreground">Số điện thoại:</span> {customerRow.phone}</p>
            <p><span className="text-muted-foreground">Chi nhánh:</span> {customerRow.branches?.name ?? "-"}</p>
            <p><span className="text-muted-foreground">Nhân viên phụ trách:</span> {assignedStaffLabel}</p>
            <p><span className="text-muted-foreground">Ngày tạo:</span> {formatDate(customerRow.created_at)}</p>
            <p><span className="text-muted-foreground">Địa chỉ:</span> {customerRow.address ?? "-"}</p>
            <p><span className="text-muted-foreground">Đơn gần nhất:</span> {formatDate(lastOrderDate)}</p>
            <p className="md:col-span-2"><span className="text-muted-foreground">Ghi chú:</span> {customerRow.note ?? "-"}</p>
          </div>
        </Card>
        <Card>
          <h2 className="mb-4 font-semibold">Tổng hợp</h2>
          <div className="space-y-3 text-sm">
            <p className="flex justify-between"><span>Tổng đơn</span><strong>{orderRows.length}</strong></p>
            <p className="flex justify-between"><span>Doanh thu đã thu</span><strong>{formatMoney(totalRevenue)}</strong></p>
            <p className="flex justify-between"><span>Tổng công nợ</span><strong>{formatMoney(totalDebt)}</strong></p>
            <p className="flex justify-between"><span>Ngày đơn gần nhất</span><strong>{formatDate(lastOrderDate)}</strong></p>
          </div>
        </Card>
      </div>

      <Card>
        <h2 className="mb-4 font-semibold">Lịch sử đơn hàng</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-3">Mã đơn</th>
                <th>Dịch vụ</th>
                <th>Trạng thái</th>
                <th>Thanh toán</th>
                <th>Ngày đơn</th>
                <th className="text-right">Tổng tiền</th>
                <th className="text-right">Còn nợ</th>
              </tr>
            </thead>
            <tbody>
              {orderRows.length === 0 ? (
                <tr><td className="py-8 text-center text-muted-foreground" colSpan={7}>Khách hàng chưa có đơn hàng</td></tr>
              ) : orderRows.map((order) => (
                <tr key={order.id} className="border-b">
                  <td className="py-3 font-medium">
                    <Link className="text-primary hover:underline" href={`/orders/${order.id}`}>{order.order_code}</Link>
                  </td>
                  <td>{order.service_type}</td>
                  <td><Badge>{order.status}</Badge></td>
                  <td><Badge>{order.payment_status}</Badge></td>
                  <td>{formatDate(order.order_date)}</td>
                  <td className="text-right">{formatMoney(order.total_amount)}</td>
                  <td className="text-right">{formatMoney(order.debt_amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
