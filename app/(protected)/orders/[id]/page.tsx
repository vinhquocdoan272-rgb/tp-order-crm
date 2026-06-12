import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { OrderFileUploader } from "@/components/upload/order-file-uploader";
import { OrderExpensesPanel } from "@/components/orders/order-expenses-panel";
import { OrderHandoverPanel } from "@/components/orders/order-handover-panel";
import { CancelOrderButton, DeleteOrderButton } from "@/components/orders/order-admin-actions";
import { canViewOrder, canViewProfitSharing } from "@/lib/auth/permissions";
import { isValidRole } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatMoney } from "@/lib/utils/format";

export const dynamic = "force-dynamic";

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, branch_id, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.is_active || !isValidRole(profile.role)) {
    redirect("/login?error=unassigned");
  }

  const [{ data: order, error: orderError }, { data: invoices }, { data: logs }] = await Promise.all([
    supabase.from("orders").select("*, customers(*), branches(name), assigned_staff:profiles!orders_assigned_staff_id_fkey(full_name)").eq("id", id).maybeSingle(),
    supabase.from("invoices").select("*").eq("order_id", id).order("created_at", { ascending: false }),
    supabase.from("audit_logs").select("*").eq("entity_id", id).order("created_at", { ascending: false }).limit(20),
  ]);

  if (orderError) {
    return (
      <Card className="border-red-200 bg-red-50 text-red-800">
        <h1 className="font-semibold">Không thể tải đơn hàng</h1>
        <p className="mt-1 text-sm">{orderError.message}</p>
      </Card>
    );
  }

  if (!order) notFound();
  const orderDetail = order as any;
  const currentUser = { id: user.id, role: profile.role, branch_id: profile.branch_id };

  const orderScope = { branch_id: orderDetail.branch_id, assigned_staff_id: orderDetail.assigned_staff_id, created_by: orderDetail.created_by };

  if (!canViewOrder(profile.role, orderScope, currentUser)) {
    return (
      <Card className="border-red-200 bg-red-50 text-red-800">
        <h1 className="font-semibold">Bạn không có quyền truy cập đơn hàng này.</h1>
        <p className="mt-1 text-sm">Vui lòng liên hệ quản trị viên nếu cần xem thông tin đơn hàng.</p>
      </Card>
    );
  }

  const showProfitSharing = canViewProfitSharing(profile.role, orderScope, currentUser);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Chi tiết đơn {orderDetail.order_code}</h1>
          <p className="text-sm text-muted-foreground">Thông tin đơn hàng, khách hàng, thanh toán, file và hóa đơn liên quan.</p>
        </div>
        <div className="flex gap-2">
          <Link className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white" href="/orders">Quay lại</Link>
          <Link className="rounded-md bg-slate-700 px-4 py-2 text-sm font-medium text-white" href={`/orders/${orderDetail.id}/edit`}>
            {profile.role === "field_staff" ? "Cập nhật" : "Sửa"}
          </Link>
          {profile.role === "branch_manager" ? <CancelOrderButton orderId={orderDetail.id} role={profile.role} /> : null}
          {profile.role === "admin" ? <DeleteOrderButton orderId={orderDetail.id} role={profile.role} /> : null}
          {profile.role !== "field_staff" ? <Link className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white" href="/invoices">Thêm hóa đơn</Link> : null}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <h2 className="mb-4 font-semibold">Thông tin đơn hàng</h2>
          <div className="grid gap-3 text-sm md:grid-cols-2">
            <p><span className="text-muted-foreground">Dịch vụ:</span> {orderDetail.service_type}</p>
            <p><span className="text-muted-foreground">Chi nhánh:</span> {orderDetail.branches?.name ?? "-"}</p>
            <p><span className="text-muted-foreground">Nhân viên phụ trách:</span> {orderDetail.assigned_staff?.full_name ?? "Chưa giao"}</p>
            <p><span className="text-muted-foreground">Trạng thái:</span> <Badge>{orderDetail.status}</Badge></p>
            <p><span className="text-muted-foreground">Thanh toán:</span> <Badge>{orderDetail.payment_status}</Badge></p>
            <p><span className="text-muted-foreground">Ngày đơn:</span> {formatDate(orderDetail.order_date)}</p>
            <p><span className="text-muted-foreground">Hoàn tất:</span> {formatDate(orderDetail.completed_at)}</p>
            <p className="md:col-span-2"><span className="text-muted-foreground">Yêu cầu:</span> {orderDetail.request_description ?? "-"}</p>
            <p className="md:col-span-2"><span className="text-muted-foreground">Ghi chú kỹ thuật:</span> {orderDetail.technical_note ?? "-"}</p>
          </div>
        </Card>
        <Card>
          <h2 className="mb-4 font-semibold">Thanh toán</h2>
          <div className="space-y-3 text-sm">
            <p className="flex justify-between"><span>Tổng tiền</span><strong>{formatMoney(orderDetail.total_amount)}</strong></p>
            <p className="flex justify-between"><span>Đã thu</span><strong>{formatMoney(orderDetail.paid_amount)}</strong></p>
            <p className="flex justify-between"><span>Còn nợ</span><strong>{formatMoney(orderDetail.debt_amount)}</strong></p>
          </div>
        </Card>
      </div>

      <Card>
        <h2 className="mb-4 font-semibold">Thông tin khách hàng</h2>
        <div className="grid gap-3 text-sm md:grid-cols-3">
          <p><span className="text-muted-foreground">Tên:</span> {orderDetail.customers?.name ?? "-"}</p>
          <p><span className="text-muted-foreground">Điện thoại:</span> {orderDetail.customers?.phone ?? "-"}</p>
          <p><span className="text-muted-foreground">Địa chỉ:</span> {orderDetail.customers?.address ?? "-"}</p>
        </div>
      </Card>

      <Card>
        <h2 className="mb-4 font-semibold">Hình ảnh / hóa đơn / chứng từ</h2>
        {orderDetail.branch_id ? <OrderFileUploader orderId={orderDetail.id} branchId={orderDetail.branch_id} role={profile.role} /> : null}
      </Card>

      {showProfitSharing ? (
        <OrderExpensesPanel
          orderId={orderDetail.id}
          branchId={orderDetail.branch_id}
          role={profile.role}
          assignedStaffId={orderDetail.assigned_staff_id}
        />
      ) : null}

      <OrderHandoverPanel
        orderId={orderDetail.id}
        branchId={orderDetail.branch_id}
        role={profile.role}
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <h2 className="mb-4 font-semibold">Hóa đơn liên quan</h2>
          <div className="space-y-2 text-sm">
            {(invoices ?? []).map((invoice) => <p key={invoice.id}>{invoice.invoice_code} - {invoice.invoice_type} - {formatMoney(invoice.amount)}</p>)}
            {(invoices ?? []).length === 0 ? <p className="text-muted-foreground">Chưa có hóa đơn</p> : null}
          </div>
        </Card>
        <Card>
          <h2 className="mb-4 font-semibold">Nhật ký hoạt động</h2>
          <div className="space-y-2 text-sm">
            {(logs ?? []).map((log) => <p key={log.id}>{formatDate(log.created_at)} - {log.action}</p>)}
            {(logs ?? []).length === 0 ? <p className="text-muted-foreground">Chưa có nhật ký</p> : null}
          </div>
        </Card>
      </div>
    </div>
  );
}
