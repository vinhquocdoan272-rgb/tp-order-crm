# Hướng dẫn triển khai TP Order CRM

Tài liệu này dùng cho lần triển khai nội bộ đầu tiên của TP Order CRM.

## 1. Chuẩn bị Supabase

1. Tạo project mới trên Supabase.
2. Vào **Project Settings > API** và lấy:
   - Project URL
   - anon public key
3. Vào **SQL Editor** để chạy migration.
4. Vào **Authentication > Users** để tạo tài khoản quản trị đầu tiên.

## 2. Chạy SQL migration

Chạy lần lượt các file trong thư mục `supabase/migrations` theo thứ tự tên file:

1. `supabase/migrations/001_initial_schema.sql`
2. `supabase/migrations/002_invoice_file_metadata.sql`

Migration sẽ tạo:

- Các bảng nghiệp vụ: chi nhánh, hồ sơ người dùng, khách hàng, đơn hàng, hóa đơn, file đơn hàng, nhật ký.
- Hàm sinh mã tự động cho khách hàng, đơn hàng, hóa đơn.
- Trigger cập nhật `updated_at`.
- RLS policies theo vai trò.
- Storage bucket `tp-order-files`.

## 3. Tạo admin user

1. Vào **Supabase > Authentication > Users**.
2. Tạo user admin, ví dụ:
   - Email: `admin@tanphat.vn`
   - Password: tự đặt mật khẩu mạnh.
3. Copy `User UID` của tài khoản vừa tạo.
4. Chạy SQL sau, thay `USER_UID_HERE` bằng UID thật:

```sql
insert into public.profiles (id, full_name, phone, role, branch_id, is_active)
values (
  'USER_UID_HERE',
  'Admin Tấn Phát',
  '0901000001',
  'admin',
  null,
  true
)
on conflict (id) do update set
  full_name = excluded.full_name,
  phone = excluded.phone,
  role = excluded.role,
  branch_id = excluded.branch_id,
  is_active = excluded.is_active;
```

Nếu muốn tạo dữ liệu mẫu, chỉnh UUID trong `supabase/seed.sql` cho khớp các user thật trong `auth.users`, sau đó chạy file seed.

## 4. Biến môi trường

Tạo `.env.local` khi chạy local, và khai báo cùng giá trị trong Vercel:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

Ghi chú:

- `NEXT_PUBLIC_SUPABASE_URL` và `NEXT_PUBLIC_SUPABASE_ANON_KEY` được dùng ở trình duyệt và server.
- `SUPABASE_SERVICE_ROLE_KEY` chỉ dùng cho server nếu cần thao tác quản trị sau này.
- Không đưa service role key vào client component.

## 5. Chạy kiểm tra local

```bash
npm install
npm run build
npm run dev
```

Ứng dụng chạy tại:

```text
http://localhost:3000
```

## 6. Deploy lên Vercel

1. Đưa source code lên GitHub.
2. Vào Vercel, chọn **Add New Project**.
3. Import repository.
4. Thêm Environment Variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
5. Build command giữ mặc định:

```bash
npm run build
```

6. Deploy.

## 7. Kiểm tra sau deploy

1. Mở URL Vercel.
2. Đăng nhập bằng tài khoản admin.
3. Kiểm tra các trang:
   - Tổng quan
   - Khách hàng
   - Đơn hàng
   - Hóa đơn
   - Công nợ
   - Báo cáo
4. Upload thử một file PDF hoặc ảnh nhỏ vào đơn hàng.
5. Xuất thử Excel từ đơn hàng hoặc báo cáo.

## 8. Lưu ý vận hành ban đầu

- Mọi tài khoản đăng nhập phải có dòng tương ứng trong bảng `profiles`.
- Nếu tài khoản chưa được phân quyền, hệ thống sẽ báo: `Tài khoản chưa được phân quyền. Vui lòng liên hệ quản trị viên.`
- RLS là lớp bảo vệ dữ liệu chính, không chỉ dựa vào giao diện.
- Bucket `tp-order-files` đang giới hạn file 10MB và chỉ nhận JPG, PNG, WEBP, PDF.
