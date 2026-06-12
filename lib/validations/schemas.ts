import { z } from "zod";
import { ACCEPTED_FILE_TYPES, MAX_FILE_SIZE } from "@/lib/constants/app";

export const customerSchema = z.object({
  name: z.string().trim().min(1, "Vui lòng nhập tên khách hàng"),
  phone: z.string().trim().min(1, "Vui lòng nhập số điện thoại"),
  address: z.string().optional(),
  customer_type: z.string().min(1, "Vui lòng chọn loại khách hàng"),
  branch_id: z.string().min(1, "Vui lòng chọn chi nhánh"),
  assigned_staff_id: z.string().optional(),
  note: z.string().optional(),
});

export const orderSchema = z
  .object({
    customer_id: z.string().min(1, "Vui lòng chọn khách hàng"),
    branch_id: z.string().min(1, "Vui lòng chọn chi nhánh"),
    assigned_staff_id: z.string().optional(),
    service_type: z.string().min(1, "Vui lòng chọn loại dịch vụ"),
    status: z.string().min(1, "Vui lòng chọn trạng thái"),
    payment_status: z.string().min(1, "Vui lòng chọn trạng thái thanh toán"),
    request_description: z.string().optional(),
    technical_note: z.string().optional(),
    total_amount: z.coerce.number().min(0, "Tổng tiền phải lớn hơn hoặc bằng 0"),
    paid_amount: z.coerce.number().min(0, "Đã thu phải lớn hơn hoặc bằng 0"),
    collected_by_type: z.enum(["staff", "store", "owner", "company_bank"]).optional(),
    collected_by_staff_id: z.string().optional(),
    collection_method: z.string().optional(),
    order_date: z.string().min(1, "Vui lòng chọn ngày đơn hàng"),
  })
  .refine((data) => data.paid_amount <= data.total_amount, {
    message: "Số tiền đã thu không được vượt quá tổng tiền",
    path: ["paid_amount"],
  })
  .refine((data) => data.collected_by_type !== "staff" || Boolean(data.collected_by_staff_id), {
    message: "Vui lòng chọn nhân viên thu tiền",
    path: ["collected_by_staff_id"],
  });

export const invoiceSchema = z.object({
  invoice_type: z.string().min(1, "Vui lòng chọn loại hóa đơn"),
  order_id: z.string().optional(),
  customer_id: z.string().optional(),
  branch_id: z.string().min(1, "Vui lòng chọn chi nhánh"),
  supplier_name: z.string().optional(),
  amount: z.coerce.number().min(0, "Số tiền phải lớn hơn hoặc bằng 0"),
  invoice_date: z.string().min(1, "Vui lòng chọn ngày hóa đơn"),
  content: z.string().optional(),
  note: z.string().optional(),
});

export const orderExpenseSchema = z
  .object({
    order_id: z.string().min(1, "Vui lòng chọn đơn hàng"),
    branch_id: z.string().min(1, "Vui lòng chọn chi nhánh"),
    expense_type: z.string().min(1, "Vui lòng chọn loại chi phí"),
    description: z.string().optional(),
    amount: z.coerce.number().positive("Số tiền chi phí phải lớn hơn 0"),
    paid_by: z.enum(["staff", "store", "owner"], { message: "Vui lòng chọn người ứng" }),
    paid_by_staff_id: z.string().optional(),
    expense_date: z.string().min(1, "Vui lòng chọn ngày chi"),
    proof_file_url: z.string().optional(),
    proof_file_path: z.string().optional(),
    note: z.string().optional(),
  })
  .refine((data) => data.paid_by !== "staff" || Boolean(data.paid_by_staff_id), {
    message: "Vui lòng chọn nhân viên ứng tiền",
    path: ["paid_by_staff_id"],
  });

export const handoverPaymentSchema = z.object({
  order_id: z.string().min(1, "Vui lòng chọn đơn hàng"),
  branch_id: z.string().min(1, "Vui lòng chọn chi nhánh"),
  staff_id: z.string().optional(),
  amount: z.coerce.number().positive("Số tiền nộp phải lớn hơn 0"),
  payment_date: z.string().min(1, "Vui lòng chọn ngày nộp"),
  collection_method: z.string().optional(),
  proof_file_url: z.string().optional(),
  proof_file_path: z.string().optional(),
  note: z.string().optional(),
});

export function validateUploadFile(file: File) {
  if (!ACCEPTED_FILE_TYPES.includes(file.type)) return "Chỉ chấp nhận JPG, PNG, WEBP hoặc PDF";
  if (file.size > MAX_FILE_SIZE) return "Dung lượng file tối đa là 10MB";
  return null;
}
