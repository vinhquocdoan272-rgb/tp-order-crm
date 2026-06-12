update public.profiles
set role = 'admin'
where role = 'accountant';

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check check (role in ('admin', 'branch_manager', 'field_staff'));

drop policy if exists "accountants view profiles" on public.profiles;
drop policy if exists "accountant customers read" on public.customers;
drop policy if exists "accountant orders read" on public.orders;
drop policy if exists "accountant invoices read" on public.invoices;
drop policy if exists "accountant invoices update" on public.invoices;
drop policy if exists "accountant invoices manage" on public.invoices;
drop policy if exists "accountant order files read" on public.order_files;
drop policy if exists "accountant order expenses read" on public.order_expenses;
drop policy if exists "accountant handover payments read" on public.order_handover_payments;
drop policy if exists "accountant storage read" on storage.objects;
drop policy if exists "accountant storage upload invoice files" on storage.objects;
drop policy if exists "accountant expense proof storage read" on storage.objects;

drop trigger if exists accountant_invoice_update on public.invoices;
drop function if exists public.enforce_accountant_invoice_update();

create or replace function public.enforce_branch_manager_invoice_file_update()
returns trigger
language plpgsql
as $$
begin
  if public.get_current_user_role() = 'branch_manager' then
    if new.id <> old.id
      or new.invoice_code <> old.invoice_code
      or new.invoice_type <> old.invoice_type
      or new.order_id is distinct from old.order_id
      or new.customer_id is distinct from old.customer_id
      or new.branch_id is distinct from old.branch_id
      or new.supplier_name is distinct from old.supplier_name
      or new.amount <> old.amount
      or new.invoice_date <> old.invoice_date
      or new.content is distinct from old.content
      or new.note is distinct from old.note
      or new.created_by is distinct from old.created_by
      or new.linked_order_file_id is distinct from old.linked_order_file_id then
      raise exception 'Bạn không có quyền chỉnh sửa hóa đơn.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists branch_manager_invoice_file_update on public.invoices;
create trigger branch_manager_invoice_file_update before update on public.invoices
for each row execute function public.enforce_branch_manager_invoice_file_update();

create or replace function public.enforce_field_staff_order_update()
returns trigger
language plpgsql
as $$
begin
  if public.get_current_user_role() = 'field_staff' then
    if new.id <> old.id
      or new.order_code <> old.order_code
      or new.customer_id is distinct from old.customer_id
      or new.branch_id is distinct from old.branch_id
      or new.assigned_staff_id is distinct from old.assigned_staff_id
      or new.service_type <> old.service_type
      or new.payment_status <> old.payment_status
      or new.request_description is distinct from old.request_description
      or new.total_amount <> old.total_amount
      or new.paid_amount <> old.paid_amount
      or new.order_date <> old.order_date
      or new.created_by is distinct from old.created_by then
      raise exception 'Bạn chỉ được xem đơn hàng được giao cho mình.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists field_staff_order_update on public.orders;
create trigger field_staff_order_update before update on public.orders
for each row execute function public.enforce_field_staff_order_update();

drop policy if exists "branch invoices update" on public.invoices;
drop policy if exists "branch invoices delete" on public.invoices;

drop policy if exists "branch invoices read" on public.invoices;
create policy "branch invoices read" on public.invoices
for select using (
  public.get_current_user_role() = 'branch_manager'
  and branch_id = public.get_current_user_branch_id()
);

drop policy if exists "branch invoices insert" on public.invoices;
create policy "branch invoices insert" on public.invoices
for insert with check (
  public.get_current_user_role() = 'branch_manager'
  and branch_id = public.get_current_user_branch_id()
);

drop policy if exists "branch invoices attach file metadata" on public.invoices;
create policy "branch invoices attach file metadata" on public.invoices
for update using (
  public.get_current_user_role() = 'branch_manager'
  and branch_id = public.get_current_user_branch_id()
)
with check (
  public.get_current_user_role() = 'branch_manager'
  and branch_id = public.get_current_user_branch_id()
);

drop policy if exists "field staff output invoices read" on public.invoices;
create policy "field staff output invoices read" on public.invoices
for select using (
  public.get_current_user_role() = 'field_staff'
  and invoice_type = 'Đầu ra'
  and exists (
    select 1
    from public.orders o
    where o.id = invoices.order_id
      and o.assigned_staff_id = auth.uid()
  )
);

drop policy if exists "field staff order files delete own" on public.order_files;
create policy "field staff order files delete own" on public.order_files
for delete using (
  public.get_current_user_role() = 'field_staff'
  and uploaded_by = auth.uid()
  and exists (
    select 1
    from public.orders o
    where o.id = order_files.order_id
      and o.assigned_staff_id = auth.uid()
  )
);

drop policy if exists "branch managers insert branch staff" on public.profiles;
create policy "branch managers insert branch staff" on public.profiles
for insert with check (
  public.get_current_user_role() = 'branch_manager'
  and role = 'field_staff'
  and branch_id = public.get_current_user_branch_id()
);

drop policy if exists "branch managers update branch staff" on public.profiles;
create policy "branch managers update branch staff" on public.profiles
for update using (
  public.get_current_user_role() = 'branch_manager'
  and role = 'field_staff'
  and branch_id = public.get_current_user_branch_id()
)
with check (
  public.get_current_user_role() = 'branch_manager'
  and role = 'field_staff'
  and branch_id = public.get_current_user_branch_id()
);

drop policy if exists "field staff assigned customers read" on public.customers;
create policy "field staff assigned customers read" on public.customers
for select using (
  public.get_current_user_role() = 'field_staff'
  and (
    assigned_staff_id = auth.uid()
    or exists (
      select 1
      from public.orders o
      where o.customer_id = customers.id
        and o.assigned_staff_id = auth.uid()
    )
  )
);

drop policy if exists "branch customer delete" on public.customers;
create policy "branch customer delete" on public.customers
for delete using (
  public.get_current_user_role() = 'branch_manager'
  and branch_id = public.get_current_user_branch_id()
);

drop policy if exists "branch orders delete" on public.orders;
create policy "branch orders delete" on public.orders
for delete using (
  public.get_current_user_role() = 'branch_manager'
  and branch_id = public.get_current_user_branch_id()
);

drop policy if exists "field staff assigned order expenses update own" on public.order_expenses;
create policy "field staff assigned order expenses update own" on public.order_expenses
for update using (
  public.get_current_user_role() = 'field_staff'
  and created_by = auth.uid()
  and exists (
    select 1
    from public.orders o
    where o.id = order_expenses.order_id
      and o.assigned_staff_id = auth.uid()
  )
)
with check (
  public.get_current_user_role() = 'field_staff'
  and created_by = auth.uid()
  and exists (
    select 1
    from public.orders o
    where o.id = order_expenses.order_id
      and o.assigned_staff_id = auth.uid()
  )
);

drop policy if exists "field staff assigned handover payments update own" on public.order_handover_payments;
create policy "field staff assigned handover payments update own" on public.order_handover_payments
for update using (
  public.get_current_user_role() = 'field_staff'
  and created_by = auth.uid()
  and exists (
    select 1
    from public.orders o
    where o.id = order_handover_payments.order_id
      and o.assigned_staff_id = auth.uid()
  )
)
with check (
  public.get_current_user_role() = 'field_staff'
  and created_by = auth.uid()
  and exists (
    select 1
    from public.orders o
    where o.id = order_handover_payments.order_id
      and o.assigned_staff_id = auth.uid()
  )
);

drop policy if exists "branch audit read" on public.audit_logs;
create policy "branch audit read" on public.audit_logs
for select using (
  public.get_current_user_role() = 'branch_manager'
  and (
    actor_id in (
      select p.id
      from public.profiles p
      where p.branch_id = public.get_current_user_branch_id()
    )
    or (metadata ->> 'branch_id') = public.get_current_user_branch_id()::text
  )
);

create or replace function public.get_staff_leaderboard(
  start_date date,
  end_date date,
  filter_branch_id uuid default null
)
returns table (
  staff_id uuid,
  staff_name text,
  branch_id uuid,
  branch_name text,
  completed_orders_count bigint,
  total_paid_amount numeric,
  total_expenses numeric,
  net_revenue_after_expenses numeric
)
language sql
security invoker
stable
as $$
  with completed_orders as (
    select
      o.id,
      o.assigned_staff_id,
      o.branch_id,
      coalesce(o.paid_amount, 0) as paid_amount,
      coalesce(ofs.total_expenses, 0) as total_expenses
    from public.orders o
    left join public.order_financial_summary ofs on ofs.order_id = o.id
    where o.status = 'Hoàn tất'
      and o.order_date >= start_date
      and o.order_date <= end_date
      and o.assigned_staff_id is not null
      and (filter_branch_id is null or o.branch_id = filter_branch_id)
  )
  select
    p.id as staff_id,
    p.full_name as staff_name,
    p.branch_id,
    b.name as branch_name,
    count(co.id) as completed_orders_count,
    coalesce(sum(co.paid_amount), 0)::numeric as total_paid_amount,
    coalesce(sum(co.total_expenses), 0)::numeric as total_expenses,
    (coalesce(sum(co.paid_amount), 0) - coalesce(sum(co.total_expenses), 0))::numeric as net_revenue_after_expenses
  from public.profiles p
  left join public.branches b on b.id = p.branch_id
  join completed_orders co on co.assigned_staff_id = p.id
  where p.role = 'field_staff'
  group by p.id, p.full_name, p.branch_id, b.name
  order by net_revenue_after_expenses desc, completed_orders_count desc;
$$;
