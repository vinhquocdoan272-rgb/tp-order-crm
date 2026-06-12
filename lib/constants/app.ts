export const USER_ROLES = [
  { value: "admin", label: "Quản trị viên / Chủ" },
  { value: "branch_manager", label: "Quản lý chi nhánh" },
  { value: "field_staff", label: "Nhân viên kỹ thuật" },
] as const;

export type UserRoleValue = (typeof USER_ROLES)[number]["value"];

export const ROLE_LABELS: Record<UserRoleValue, string> = {
  admin: "Quản trị viên / Chủ",
  branch_manager: "Quản lý chi nhánh",
  field_staff: "Nhân viên kỹ thuật",
};

export const SERVICE_TYPES = [
  "Cài Windows",
  "Cài Office",
  "Sửa laptop",
  "Sửa PC",
  "Sửa máy in",
  "Đổ mực máy in",
  "Thay linh kiện",
  "Vệ sinh laptop/PC",
  "Bán máy bộ",
  "Bán laptop",
  "Bán linh kiện",
  "Bán phụ kiện",
  "Bảo hành",
  "Khác",
] as const;

export const CUSTOMER_TYPES = ["Cá nhân", "Công ty", "Đại lý", "Khách quen", "Khách bảo hành"] as const;

export const ORDER_STATUSES = [
  "Mới tạo",
  "Đang xử lý",
  "Chờ linh kiện",
  "Hoàn tất",
  "Bảo hành",
  "Hủy",
] as const;

export const PAYMENT_STATUSES = ["Chưa thu", "Thu một phần", "Đã thu đủ", "Còn nợ"] as const;
export const INVOICE_TYPES = ["Đầu vào", "Đầu ra"] as const;
export const FILE_TYPES = ["Hóa đơn", "Phiếu thu", "Phiếu bảo hành", "Ảnh thiết bị", "Ảnh hoàn tất", "Chứng từ nộp tiền", "Chứng từ chi phí", "Khác"] as const;

export const EXPENSE_TYPES = [
  "Chi phí vật tư",
  "Chi phí sửa chữa",
  "Chi phí thuê ngoài",
  "Chi phí vận chuyển",
  "Chi phí linh kiện",
  "Chi phí khác",
] as const;

export const EXPENSE_PAID_BY_OPTIONS = [
  { value: "staff", label: "Nhân viên ứng" },
  { value: "store", label: "Cửa hàng ứng" },
  { value: "owner", label: "Chủ ứng" },
] as const;

export type ExpensePaidBy = (typeof EXPENSE_PAID_BY_OPTIONS)[number]["value"];

export const EXPENSE_PAID_BY_LABELS: Record<ExpensePaidBy, string> = {
  staff: "Nhân viên ứng",
  store: "Cửa hàng ứng",
  owner: "Chủ ứng",
};

export const COLLECTED_BY_OPTIONS = [
  { value: "staff", label: "Nhân viên thu" },
  { value: "store", label: "Cửa hàng thu" },
  { value: "owner", label: "Chủ nhận trực tiếp" },
  { value: "company_bank", label: "Khách chuyển khoản công ty" },
] as const;

export type CollectedByType = (typeof COLLECTED_BY_OPTIONS)[number]["value"];

export const COLLECTED_BY_LABELS: Record<CollectedByType, string> = {
  staff: "Nhân viên thu",
  store: "Cửa hàng thu",
  owner: "Chủ nhận trực tiếp",
  company_bank: "Khách chuyển khoản công ty",
};

export const COLLECTION_METHODS = ["Tiền mặt", "Chuyển khoản", "Quẹt thẻ", "Khác"] as const;
export const HANDOVER_STATUSES = ["Chưa nộp", "Nộp một phần", "Đã nộp đủ", "Không cần nộp"] as const;

export const DEFAULT_STAFF_SHARE_PERCENT = 50;
export const DEFAULT_OWNER_SHARE_PERCENT = 50;

export const FILE_BUCKET = "tp-order-files";
export const MAX_FILE_SIZE = 10 * 1024 * 1024;
export const ACCEPTED_FILE_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

export const STATUS_TONE: Record<string, string> = {
  "Mới tạo": "bg-slate-100 text-slate-700",
  "Đang xử lý": "bg-sky-100 text-sky-700",
  "Chờ linh kiện": "bg-amber-100 text-amber-800",
  "Hoàn tất": "bg-emerald-100 text-emerald-700",
  "Bảo hành": "bg-violet-100 text-violet-700",
  "Hủy": "bg-zinc-200 text-zinc-700",
  "Chưa thu": "bg-slate-100 text-slate-700",
  "Thu một phần": "bg-amber-100 text-amber-800",
  "Đã thu đủ": "bg-teal-100 text-teal-700",
  "Còn nợ": "bg-rose-100 text-rose-700",
  "Chưa nộp": "bg-rose-100 text-rose-700",
  "Nộp một phần": "bg-amber-100 text-amber-800",
  "Đã nộp đủ": "bg-emerald-100 text-emerald-700",
  "Không cần nộp": "bg-slate-100 text-slate-700",
};
