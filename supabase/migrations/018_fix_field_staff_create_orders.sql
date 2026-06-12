-- Fix field_staff order/customer creation permissions.
-- Idempotent and data-safe: only replaces policies/triggers/functions.

alter table public.orders enable row level security;
alter table public.customers enable row level security;
alter table public.order_files enable row level security;
alter table public.order_expenses enable row level security;
alter table public.order_handover_payments enable row level security;

create or replace function public.enforce_field_staff_order_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.get_current_user_role() = 'field_staff' then
    if old.assigned_staff_id is distinct from auth.uid() and old.created_by is distinct from auth.uid() then
      raise exception 'Bạn chỉ được cập nhật đơn hàng do bạn tạo hoặc được giao cho bạn.';
    end if;

    if new.order_code is distinct from old.order_code
      or new.branch_id is distinct from old.branch_id
      or new.assigned_staff_id is distinct from old.assigned_staff_id
      or new.created_by is distinct from old.created_by
      or new.completed_at is distinct from old.completed_at then
      raise exception 'Bạn không có quyền thay đổi chi nhánh, nhân viên phụ trách hoặc mã đơn hàng.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists field_staff_order_update on public.orders;
create trigger field_staff_order_update before update on public.orders
for each row execute function public.enforce_field_staff_order_update();

drop policy if exists "admin full orders" on public.orders;
drop policy if exists "admin orders delete" on public.orders;
drop policy if exists "branch orders read" on public.orders;
drop policy if exists "branch orders insert" on public.orders;
drop policy if exists "branch orders update" on public.orders;
drop policy if exists "branch orders delete" on public.orders;
drop policy if exists "staff assigned orders read" on public.orders;
drop policy if exists "staff assigned orders update" on public.orders;
drop policy if exists "field staff assigned or created orders read" on public.orders;
drop policy if exists "field staff own branch orders insert" on public.orders;
drop policy if exists "field staff assigned or created orders update" on public.orders;

create policy "admin full orders" on public.orders
for all using (public.get_current_user_role() = 'admin')
with check (public.get_current_user_role() = 'admin');

create policy "branch orders read" on public.orders
for select using (
  public.get_current_user_role() = 'branch_manager'
  and branch_id = public.get_current_user_branch_id()
);

create policy "branch orders insert" on public.orders
for insert with check (
  public.get_current_user_role() = 'branch_manager'
  and branch_id = public.get_current_user_branch_id()
);

create policy "branch orders update" on public.orders
for update using (
  public.get_current_user_role() = 'branch_manager'
  and branch_id = public.get_current_user_branch_id()
) with check (
  public.get_current_user_role() = 'branch_manager'
  and branch_id = public.get_current_user_branch_id()
);

create policy "field staff assigned or created orders read" on public.orders
for select using (
  public.get_current_user_role() = 'field_staff'
  and (assigned_staff_id = auth.uid() or created_by = auth.uid())
);

create policy "field staff own branch orders insert" on public.orders
for insert with check (
  public.get_current_user_role() = 'field_staff'
  and branch_id = public.get_current_user_branch_id()
  and assigned_staff_id = auth.uid()
  and created_by = auth.uid()
);

create policy "field staff assigned or created orders update" on public.orders
for update using (
  public.get_current_user_role() = 'field_staff'
  and (assigned_staff_id = auth.uid() or created_by = auth.uid())
) with check (
  public.get_current_user_role() = 'field_staff'
  and branch_id = public.get_current_user_branch_id()
  and (assigned_staff_id = auth.uid() or created_by = auth.uid())
);

drop policy if exists "admin full customers" on public.customers;
drop policy if exists "branch customer read" on public.customers;
drop policy if exists "branch customer insert" on public.customers;
drop policy if exists "branch customer update" on public.customers;
drop policy if exists "branch customer delete" on public.customers;
drop policy if exists "staff customer via assigned order" on public.customers;
drop policy if exists "field staff assigned customers read" on public.customers;
drop policy if exists "field staff branch customers read" on public.customers;
drop policy if exists "field staff branch customers insert" on public.customers;
drop policy if exists "field staff own customers update" on public.customers;

create policy "admin full customers" on public.customers
for all using (public.get_current_user_role() = 'admin')
with check (public.get_current_user_role() = 'admin');

create policy "branch customer read" on public.customers
for select using (
  public.get_current_user_role() = 'branch_manager'
  and branch_id = public.get_current_user_branch_id()
);

create policy "branch customer insert" on public.customers
for insert with check (
  public.get_current_user_role() = 'branch_manager'
  and branch_id = public.get_current_user_branch_id()
);

create policy "branch customer update" on public.customers
for update using (
  public.get_current_user_role() = 'branch_manager'
  and branch_id = public.get_current_user_branch_id()
) with check (
  public.get_current_user_role() = 'branch_manager'
  and branch_id = public.get_current_user_branch_id()
);

create policy "field staff branch customers read" on public.customers
for select using (
  public.get_current_user_role() = 'field_staff'
  and branch_id = public.get_current_user_branch_id()
);

create policy "field staff branch customers insert" on public.customers
for insert with check (
  public.get_current_user_role() = 'field_staff'
  and branch_id = public.get_current_user_branch_id()
  and created_by = auth.uid()
  and (assigned_staff_id is null or assigned_staff_id = auth.uid())
);

create policy "field staff own customers update" on public.customers
for update using (
  public.get_current_user_role() = 'field_staff'
  and branch_id = public.get_current_user_branch_id()
  and (created_by = auth.uid() or assigned_staff_id = auth.uid())
) with check (
  public.get_current_user_role() = 'field_staff'
  and branch_id = public.get_current_user_branch_id()
  and (assigned_staff_id is null or assigned_staff_id = auth.uid())
);

drop policy if exists "staff order files read" on public.order_files;
drop policy if exists "staff order files insert" on public.order_files;
drop policy if exists "field staff order files delete own" on public.order_files;
drop policy if exists "field staff own order files read" on public.order_files;
drop policy if exists "field staff own order files insert" on public.order_files;
drop policy if exists "field staff own order files delete" on public.order_files;

create policy "field staff own order files read" on public.order_files
for select using (
  public.get_current_user_role() = 'field_staff'
  and exists (
    select 1 from public.orders o
    where o.id = order_files.order_id
      and (o.assigned_staff_id = auth.uid() or o.created_by = auth.uid())
  )
);

create policy "field staff own order files insert" on public.order_files
for insert with check (
  public.get_current_user_role() = 'field_staff'
  and uploaded_by = auth.uid()
  and exists (
    select 1 from public.orders o
    where o.id = order_files.order_id
      and (o.assigned_staff_id = auth.uid() or o.created_by = auth.uid())
  )
);

create policy "field staff own order files delete" on public.order_files
for delete using (
  public.get_current_user_role() = 'field_staff'
  and uploaded_by = auth.uid()
  and exists (
    select 1 from public.orders o
    where o.id = order_files.order_id
      and (o.assigned_staff_id = auth.uid() or o.created_by = auth.uid())
  )
);

drop policy if exists "field staff assigned order expenses read" on public.order_expenses;
drop policy if exists "field staff assigned order expenses insert" on public.order_expenses;
drop policy if exists "field staff assigned order expenses update own" on public.order_expenses;
drop policy if exists "field staff own order expenses read" on public.order_expenses;
drop policy if exists "field staff own order expenses insert" on public.order_expenses;
drop policy if exists "field staff own order expenses update" on public.order_expenses;

create policy "field staff own order expenses read" on public.order_expenses
for select using (
  public.get_current_user_role() = 'field_staff'
  and exists (
    select 1 from public.orders o
    where o.id = order_expenses.order_id
      and (o.assigned_staff_id = auth.uid() or o.created_by = auth.uid())
  )
);

create policy "field staff own order expenses insert" on public.order_expenses
for insert with check (
  public.get_current_user_role() = 'field_staff'
  and created_by = auth.uid()
  and exists (
    select 1 from public.orders o
    where o.id = order_expenses.order_id
      and (o.assigned_staff_id = auth.uid() or o.created_by = auth.uid())
  )
);

create policy "field staff own order expenses update" on public.order_expenses
for update using (
  public.get_current_user_role() = 'field_staff'
  and created_by = auth.uid()
  and exists (
    select 1 from public.orders o
    where o.id = order_expenses.order_id
      and (o.assigned_staff_id = auth.uid() or o.created_by = auth.uid())
  )
) with check (
  public.get_current_user_role() = 'field_staff'
  and created_by = auth.uid()
  and exists (
    select 1 from public.orders o
    where o.id = order_expenses.order_id
      and (o.assigned_staff_id = auth.uid() or o.created_by = auth.uid())
  )
);

drop policy if exists "field staff assigned handover payments read" on public.order_handover_payments;
drop policy if exists "field staff assigned handover payments insert" on public.order_handover_payments;
drop policy if exists "field staff assigned handover payments update own" on public.order_handover_payments;
drop policy if exists "field staff own handover payments read" on public.order_handover_payments;
drop policy if exists "field staff own handover payments insert" on public.order_handover_payments;
drop policy if exists "field staff own handover payments update" on public.order_handover_payments;

create policy "field staff own handover payments read" on public.order_handover_payments
for select using (
  public.get_current_user_role() = 'field_staff'
  and exists (
    select 1 from public.orders o
    where o.id = order_handover_payments.order_id
      and (o.assigned_staff_id = auth.uid() or o.created_by = auth.uid())
  )
);

create policy "field staff own handover payments insert" on public.order_handover_payments
for insert with check (
  public.get_current_user_role() = 'field_staff'
  and created_by = auth.uid()
  and exists (
    select 1 from public.orders o
    where o.id = order_handover_payments.order_id
      and (o.assigned_staff_id = auth.uid() or o.created_by = auth.uid())
  )
);

create policy "field staff own handover payments update" on public.order_handover_payments
for update using (
  public.get_current_user_role() = 'field_staff'
  and created_by = auth.uid()
  and exists (
    select 1 from public.orders o
    where o.id = order_handover_payments.order_id
      and (o.assigned_staff_id = auth.uid() or o.created_by = auth.uid())
  )
) with check (
  public.get_current_user_role() = 'field_staff'
  and created_by = auth.uid()
  and exists (
    select 1 from public.orders o
    where o.id = order_handover_payments.order_id
      and (o.assigned_staff_id = auth.uid() or o.created_by = auth.uid())
  )
);
