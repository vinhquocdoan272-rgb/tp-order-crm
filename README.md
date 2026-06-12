# TP Order CRM

Phần mềm quản lý đơn hàng dịch vụ cho **Công ty TNHH Thương Mại Dịch Vụ Tin Học Tấn Phát**.

## Chức năng chính

- Đăng nhập bằng Supabase Auth.
- Dashboard doanh thu, công nợ, trạng thái đơn hàng.
- Quản lý chi nhánh, người dùng, khách hàng, đơn hàng, hóa đơn.
- Trang chi tiết đơn hàng, upload ảnh/PDF hóa đơn hoặc ảnh hoàn tất.
- Theo dõi công nợ và xuất Excel.
- Báo cáo doanh thu theo dịch vụ, hóa đơn đầu vào/đầu ra.
- Supabase PostgreSQL, Storage và Row Level Security theo vai trò.

## Cài đặt dependencies

Máy cần có Node.js và npm.

```bash
npm install
```

## Tạo Supabase project

1. Vào Supabase và tạo project mới.
2. Mở **SQL Editor**.
3. Chạy file `supabase/migrations/001_initial_schema.sql`.
4. Vào **Authentication > Users**, tạo các tài khoản mặc định bên dưới.
5. Lấy UUID thật của từng user trong `auth.users`.
6. Sửa UUID trong `supabase/seed.sql` cho khớp với UUID thật.
7. Chạy `supabase/seed.sql`.

## Biến môi trường

Tạo file `.env.local` từ `.env.example`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

Không đưa `SUPABASE_SERVICE_ROLE_KEY` lên trình duyệt.

## Chạy local

```bash
npm run dev
```

Mở `http://localhost:3000`.

## Deploy Vercel

1. Đưa source code lên GitHub.
2. Import project vào Vercel.
3. Thêm các biến môi trường giống `.env.local`.
4. Deploy.

Xem hướng dẫn chi tiết trong `DEPLOYMENT.md`.

## Tài khoản seed đề xuất

Tạo các user này trong Supabase Auth trước, sau đó cập nhật UUID trong `seed.sql`:

| Email | Vai trò |
| --- | --- |
| admin@tanphat.vn | admin |
| quanly.chinh@tanphat.vn | branch_manager |
| quanly.cn2@tanphat.vn | branch_manager |
| kythuat.a@tanphat.vn | field_staff |
| kythuat.b@tanphat.vn | field_staff |
| ketoan@tanphat.vn | accountant |

Bạn tự đặt mật khẩu khi tạo user trong Supabase.

## Ghi chú quyền và RLS

- Admin có toàn quyền.
- Quản lý chi nhánh chỉ thao tác dữ liệu thuộc chi nhánh của mình.
- Kỹ thuật viên chỉ xem đơn được giao, cập nhật trạng thái, ghi chú kỹ thuật, thời gian hoàn tất và upload file.
- Kế toán xem hóa đơn, doanh thu, công nợ và xuất báo cáo.
- RLS nằm trong migration, không chỉ kiểm tra ở giao diện.

## Storage

Migration tạo bucket `tp-order-files` với giới hạn 10MB và chỉ nhận:

- `image/jpeg`
- `image/png`
- `image/webp`
- `application/pdf`

Cấu trúc file:

```text
branch/{branch_id}/orders/{order_id}/...
branch/{branch_id}/invoices/{invoice_id}/...
```

## Lưu ý triển khai tiếp

Phiên bản hiện tại là nền tảng chạy được cho CRM. Khi đưa vào vận hành thật, nên cải thiện thêm:

- Form chọn khách hàng/chi nhánh/nhân viên bằng combobox thay vì nhập UUID.
- Tạo màn hình quản trị Auth user bằng server action dùng service role.
- Tạo signed URL cho file nếu bucket để private hoàn toàn.
- Bổ sung test tự động và log audit chi tiết cho từng thao tác.
