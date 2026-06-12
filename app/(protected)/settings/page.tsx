import { CUSTOMER_TYPES, FILE_TYPES, INVOICE_TYPES, ORDER_STATUSES, PAYMENT_STATUSES, SERVICE_TYPES, USER_ROLES } from "@/lib/constants/app";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function SettingsPage() {
  const groups = [
    ["Loại dịch vụ", SERVICE_TYPES],
    ["Trạng thái đơn hàng", ORDER_STATUSES],
    ["Trạng thái thanh toán", PAYMENT_STATUSES],
    ["Loại khách hàng", CUSTOMER_TYPES],
    ["Loại hóa đơn", INVOICE_TYPES],
    ["Loại file", FILE_TYPES],
    ["Vai trò", USER_ROLES.map((role) => role.value)],
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Cài đặt</h1>
        <p className="text-sm text-muted-foreground">Thông tin công ty và danh mục dùng trong hệ thống.</p>
      </div>
      <Card>
        <h2 className="mb-3 font-semibold">Thông tin công ty</h2>
        <div className="grid gap-3 text-sm md:grid-cols-2">
          <p><span className="text-muted-foreground">Tên:</span> Công ty TNHH Thương Mại Dịch Vụ Tin Học Tấn Phát</p>
          <p><span className="text-muted-foreground">Ứng dụng:</span> TP Order CRM</p>
          <p><span className="text-muted-foreground">Bucket file:</span> tp-order-files</p>
          <p><span className="text-muted-foreground">Ngôn ngữ:</span> Tiếng Việt</p>
        </div>
      </Card>
      <div className="grid gap-4 xl:grid-cols-2">
        {groups.map(([title, values]) => (
          <Card key={String(title)}>
            <h2 className="mb-3 font-semibold">{title}</h2>
            <div className="flex flex-wrap gap-2">
              {(values as readonly string[]).map((value) => <Badge key={value}>{value}</Badge>)}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
