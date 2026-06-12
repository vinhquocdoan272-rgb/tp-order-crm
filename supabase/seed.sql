insert into public.branches (id, name, address, phone, manager_name, note) values
('11111111-1111-1111-1111-111111111111', 'Tân Bình', 'TP. Hồ Chí Minh', '0900000001', 'Quản lý Tân Bình', 'Chi nhánh mẫu'),
('22222222-2222-2222-2222-222222222222', 'Quận 11', 'TP. Hồ Chí Minh', '0900000002', 'Quản lý Quận 11', null),
('33333333-3333-3333-3333-333333333333', 'Gò Vấp', 'TP. Hồ Chí Minh', '0900000003', 'Quản lý Gò Vấp', null)
on conflict (id) do update set
  name = excluded.name,
  address = excluded.address,
  phone = excluded.phone,
  manager_name = excluded.manager_name,
  note = excluded.note;

-- Create these Supabase Auth users first, then replace the UUIDs below with the real auth.users.id values.
with seed_profiles (id, full_name, phone, role, branch_id, is_active) as (
  values
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'Admin Tấn Phát', '0901000001', 'admin', null::uuid, true),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid, 'Quản lý Tân Bình', '0901000002', 'branch_manager', '11111111-1111-1111-1111-111111111111'::uuid, true),
    ('cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid, 'Quản lý Quận 11', '0901000003', 'branch_manager', '22222222-2222-2222-2222-222222222222'::uuid, true),
    ('dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid, 'Nhân viên kỹ thuật A', '0901000004', 'field_staff', '11111111-1111-1111-1111-111111111111'::uuid, true),
    ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'::uuid, 'Nhân viên kỹ thuật B', '0901000005', 'field_staff', '22222222-2222-2222-2222-222222222222'::uuid, true),
    ('ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid, 'Quản trị viên phụ', '0901000006', 'admin', null::uuid, true)
)
insert into public.profiles (id, full_name, phone, role, branch_id, is_active)
select sp.id, sp.full_name, sp.phone, sp.role, sp.branch_id, sp.is_active
from seed_profiles sp
where exists (select 1 from auth.users u where u.id = sp.id)
on conflict (id) do update set
  full_name = excluded.full_name,
  phone = excluded.phone,
  role = excluded.role,
  branch_id = excluded.branch_id,
  is_active = excluded.is_active;

insert into public.customers (
  customer_code,
  name,
  phone,
  address,
  customer_type,
  branch_id,
  assigned_staff_id,
  note,
  created_by
)
select
  'KH' || lpad(i::text, 6, '0'),
  'Khách hàng ' || i,
  '09' || lpad((20000000 + i)::text, 8, '0'),
  case when i % 3 = 0 then 'Gò Vấp' when i % 2 = 0 then 'Quận 11' else 'Tân Bình' end,
  (array['Cá nhân','Công ty','Đại lý','Khách quen','Khách bảo hành'])[1 + (i % 5)],
  branch_data.branch_id,
  (
    select p.id
    from public.profiles p
    where p.role = 'field_staff'
      and p.branch_id = branch_data.branch_id
    order by p.created_at
    limit 1
  ),
  'Dữ liệu mẫu',
  (select id from public.profiles where role = 'admin' order by created_at limit 1)
from generate_series(1, 20) i
cross join lateral (
  select (array[
    '11111111-1111-1111-1111-111111111111'::uuid,
    '22222222-2222-2222-2222-222222222222'::uuid,
    '33333333-3333-3333-3333-333333333333'::uuid
  ])[1 + (i % 3)] as branch_id
) branch_data
on conflict (customer_code) do update set
  name = excluded.name,
  phone = excluded.phone,
  address = excluded.address,
  customer_type = excluded.customer_type,
  branch_id = excluded.branch_id,
  assigned_staff_id = excluded.assigned_staff_id,
  note = excluded.note;

insert into public.orders (
  order_code,
  customer_id,
  branch_id,
  assigned_staff_id,
  service_type,
  status,
  payment_status,
  request_description,
  technical_note,
  total_amount,
  paid_amount,
  order_date,
  completed_at,
  created_by
)
select
  'DH' || lpad(i::text, 6, '0'),
  c.id,
  c.branch_id,
  coalesce(
    c.assigned_staff_id,
    (
      select p.id
      from public.profiles p
      where p.role = 'field_staff'
        and p.branch_id = c.branch_id
      order by p.created_at
      limit 1
    )
  ),
  (array['Cài Windows','Cài Office','Sửa laptop','Sửa PC','Sửa máy in','Đổ mực máy in','Thay linh kiện','Vệ sinh laptop/PC','Bán máy bộ','Bán laptop','Bán linh kiện','Bán phụ kiện','Bảo hành','Khác'])[1 + (i % 14)],
  (array['Mới tạo','Đang xử lý','Chờ linh kiện','Hoàn tất','Bảo hành','Hủy'])[1 + (i % 6)],
  case when i % 4 = 0 then 'Đã thu đủ' when i % 3 = 0 then 'Thu một phần' when i % 5 = 0 then 'Còn nợ' else 'Chưa thu' end,
  'Yêu cầu dịch vụ mẫu ' || i,
  'Ghi chú kỹ thuật mẫu',
  (150000 + i * 25000),
  case when i % 3 = 0 then (80000 + i * 10000) else (150000 + i * 25000) end,
  current_date - (i % 30),
  case when i % 4 = 0 then now() - make_interval(days => i % 20) else null end,
  (select id from public.profiles where role = 'admin' order by created_at limit 1)
from generate_series(1, 40) i
join lateral (
  select *
  from public.customers
  order by customer_code
  offset ((i - 1) % 20)
  limit 1
) c on true
on conflict (order_code) do update set
  customer_id = excluded.customer_id,
  branch_id = excluded.branch_id,
  assigned_staff_id = excluded.assigned_staff_id,
  service_type = excluded.service_type,
  status = excluded.status,
  payment_status = excluded.payment_status,
  request_description = excluded.request_description,
  technical_note = excluded.technical_note,
  total_amount = excluded.total_amount,
  paid_amount = excluded.paid_amount,
  order_date = excluded.order_date,
  completed_at = excluded.completed_at;

insert into public.invoices (
  invoice_code,
  invoice_type,
  order_id,
  customer_id,
  branch_id,
  supplier_name,
  amount,
  invoice_date,
  content,
  note,
  created_by
)
select
  case when i % 2 = 0 then 'HDV' else 'HDR' end || lpad(i::text, 6, '0'),
  case when i % 2 = 0 then 'Đầu vào' else 'Đầu ra' end,
  o.id,
  o.customer_id,
  o.branch_id,
  case when i % 2 = 0 then 'Nhà cung cấp ' || i else null end,
  (100000 + i * 35000),
  current_date - (i % 25),
  'Hóa đơn mẫu ' || i,
  'Dữ liệu mẫu',
  (select id from public.profiles where role = 'admin' order by created_at limit 1)
from generate_series(1, 30) i
join lateral (
  select *
  from public.orders
  order by order_code
  offset ((i - 1) % 40)
  limit 1
) o on true
on conflict (invoice_code) do update set
  invoice_type = excluded.invoice_type,
  order_id = excluded.order_id,
  customer_id = excluded.customer_id,
  branch_id = excluded.branch_id,
  supplier_name = excluded.supplier_name,
  amount = excluded.amount,
  invoice_date = excluded.invoice_date,
  content = excluded.content,
  note = excluded.note;

insert into public.order_expenses (
  order_id,
  branch_id,
  expense_type,
  description,
  amount,
  paid_by,
  paid_by_staff_id,
  expense_date,
  note,
  created_by
)
select
  o.id,
  o.branch_id,
  (array['Chi phí vật tư','Chi phí sửa chữa','Chi phí thuê ngoài','Chi phí vận chuyển','Chi phí linh kiện','Chi phí khác'])[1 + (i % 6)],
  'Chi phí mẫu cho đơn ' || o.order_code,
  (20000 + i * 5000),
  case when i % 3 = 0 then 'staff' when i % 3 = 1 then 'store' else 'owner' end,
  case when i % 3 = 0 then o.assigned_staff_id else null end,
  current_date - (i % 20),
  'Dữ liệu chi phí mẫu',
  (select id from public.profiles where role = 'admin' order by created_at limit 1)
from generate_series(1, 24) i
join lateral (
  select *
  from public.orders
  order by order_code
  offset ((i - 1) % 40)
  limit 1
) o on true
where not exists (
  select 1
  from public.order_expenses oe
  where oe.order_id = o.id
    and oe.description = 'Chi phí mẫu cho đơn ' || o.order_code
);
