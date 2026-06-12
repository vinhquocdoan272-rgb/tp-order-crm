create table if not exists public.order_expenses (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  branch_id uuid references public.branches(id),
  expense_type text not null,
  description text,
  amount numeric(14,2) not null default 0 check (amount > 0),
  paid_by text not null check (paid_by in ('staff', 'store', 'owner')),
  paid_by_staff_id uuid references public.profiles(id) on delete set null,
  expense_date date default current_date,
  proof_file_url text,
  proof_file_path text,
  note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint staff_expense_requires_staff check (paid_by <> 'staff' or paid_by_staff_id is not null)
);

create index if not exists order_expenses_order_id_idx on public.order_expenses(order_id);
create index if not exists order_expenses_branch_id_idx on public.order_expenses(branch_id);
create index if not exists order_expenses_paid_by_staff_id_idx on public.order_expenses(paid_by_staff_id);
create index if not exists order_expenses_expense_date_idx on public.order_expenses(expense_date);

create or replace function public.set_order_expense_branch()
returns trigger
language plpgsql
as $$
begin
  if new.branch_id is null then
    select branch_id into new.branch_id
    from public.orders
    where id = new.order_id;
  end if;

  return new;
end;
$$;

drop trigger if exists order_expenses_set_branch on public.order_expenses;
create trigger order_expenses_set_branch before insert or update on public.order_expenses
for each row execute function public.set_order_expense_branch();

drop trigger if exists order_expenses_updated_at on public.order_expenses;
create trigger order_expenses_updated_at before update on public.order_expenses
for each row execute function public.update_updated_at_column();

create or replace view public.order_financial_summary as
select
  o.id as order_id,
  o.branch_id,
  o.assigned_staff_id,
  coalesce(o.total_amount, 0)::numeric(14,2) as total_amount,
  coalesce(o.paid_amount, 0)::numeric(14,2) as paid_amount,
  coalesce(o.debt_amount, 0)::numeric(14,2) as debt_amount,
  coalesce(expense_totals.total_expenses, 0)::numeric(14,2) as total_expenses,
  coalesce(expense_totals.staff_paid_expenses, 0)::numeric(14,2) as staff_paid_expenses,
  coalesce(expense_totals.store_paid_expenses, 0)::numeric(14,2) as store_paid_expenses,
  coalesce(expense_totals.owner_paid_expenses, 0)::numeric(14,2) as owner_paid_expenses,
  (coalesce(o.paid_amount, 0) - coalesce(expense_totals.total_expenses, 0))::numeric(14,2) as net_profit,
  ((coalesce(o.paid_amount, 0) - coalesce(expense_totals.total_expenses, 0)) * 0.5)::numeric(14,2) as staff_profit_share,
  ((coalesce(o.paid_amount, 0) - coalesce(expense_totals.total_expenses, 0)) * 0.5)::numeric(14,2) as owner_profit_share,
  (((coalesce(o.paid_amount, 0) - coalesce(expense_totals.total_expenses, 0)) * 0.5) + coalesce(expense_totals.staff_paid_expenses, 0))::numeric(14,2) as staff_total_receivable,
  (((coalesce(o.paid_amount, 0) - coalesce(expense_totals.total_expenses, 0)) * 0.5) + coalesce(expense_totals.store_paid_expenses, 0) + coalesce(expense_totals.owner_paid_expenses, 0))::numeric(14,2) as owner_total_receivable
from public.orders o
left join (
  select
    order_id,
    sum(amount) as total_expenses,
    sum(case when paid_by = 'staff' then amount else 0 end) as staff_paid_expenses,
    sum(case when paid_by = 'store' then amount else 0 end) as store_paid_expenses,
    sum(case when paid_by = 'owner' then amount else 0 end) as owner_paid_expenses
  from public.order_expenses
  group by order_id
) expense_totals on expense_totals.order_id = o.id;

alter table public.order_expenses enable row level security;

drop policy if exists "admin full order expenses" on public.order_expenses;
create policy "admin full order expenses" on public.order_expenses
for all using (public.get_current_user_role() = 'admin')
with check (public.get_current_user_role() = 'admin');

drop policy if exists "branch order expenses read" on public.order_expenses;
create policy "branch order expenses read" on public.order_expenses
for select using (
  public.get_current_user_role() = 'branch_manager'
  and branch_id = public.get_current_user_branch_id()
);

drop policy if exists "branch order expenses insert" on public.order_expenses;
create policy "branch order expenses insert" on public.order_expenses
for insert with check (
  public.get_current_user_role() = 'branch_manager'
  and branch_id = public.get_current_user_branch_id()
);

drop policy if exists "branch order expenses update" on public.order_expenses;
create policy "branch order expenses update" on public.order_expenses
for update using (
  public.get_current_user_role() = 'branch_manager'
  and branch_id = public.get_current_user_branch_id()
) with check (branch_id = public.get_current_user_branch_id());

drop policy if exists "branch order expenses delete" on public.order_expenses;
create policy "branch order expenses delete" on public.order_expenses
for delete using (
  public.get_current_user_role() = 'branch_manager'
  and branch_id = public.get_current_user_branch_id()
);

drop policy if exists "field staff assigned order expenses read" on public.order_expenses;
create policy "field staff assigned order expenses read" on public.order_expenses
for select using (
  public.get_current_user_role() = 'field_staff'
  and exists (
    select 1 from public.orders o
    where o.id = order_expenses.order_id
      and o.assigned_staff_id = auth.uid()
  )
);

drop policy if exists "field staff assigned order expenses insert" on public.order_expenses;
create policy "field staff assigned order expenses insert" on public.order_expenses
for insert with check (
  public.get_current_user_role() = 'field_staff'
  and exists (
    select 1 from public.orders o
    where o.id = order_expenses.order_id
      and o.assigned_staff_id = auth.uid()
  )
);

drop policy if exists "accountant order expenses read" on public.order_expenses;
create policy "accountant order expenses read" on public.order_expenses
for select using (public.get_current_user_role() = 'accountant');

drop policy if exists "admin expense proof storage full" on storage.objects;
create policy "admin expense proof storage full" on storage.objects
for all
using (
  bucket_id = 'tp-order-files'
  and public.get_current_user_role() = 'admin'
  and split_part(name, '/', 1) = 'branch'
  and split_part(name, '/', 3) = 'orders'
  and split_part(name, '/', 5) = 'expenses'
)
with check (
  bucket_id = 'tp-order-files'
  and public.get_current_user_role() = 'admin'
  and split_part(name, '/', 1) = 'branch'
  and split_part(name, '/', 3) = 'orders'
  and split_part(name, '/', 5) = 'expenses'
);

drop policy if exists "branch expense proof storage write" on storage.objects;
create policy "branch expense proof storage write" on storage.objects
for insert with check (
  bucket_id = 'tp-order-files'
  and public.get_current_user_role() = 'branch_manager'
  and split_part(name, '/', 1) = 'branch'
  and public.try_parse_uuid(split_part(name, '/', 2)) = public.get_current_user_branch_id()
  and split_part(name, '/', 3) = 'orders'
  and split_part(name, '/', 5) = 'expenses'
);

drop policy if exists "branch expense proof storage read" on storage.objects;
create policy "branch expense proof storage read" on storage.objects
for select using (
  bucket_id = 'tp-order-files'
  and public.get_current_user_role() = 'branch_manager'
  and split_part(name, '/', 1) = 'branch'
  and public.try_parse_uuid(split_part(name, '/', 2)) = public.get_current_user_branch_id()
  and split_part(name, '/', 3) = 'orders'
  and split_part(name, '/', 5) = 'expenses'
);

drop policy if exists "field staff expense proof storage write" on storage.objects;
create policy "field staff expense proof storage write" on storage.objects
for insert with check (
  bucket_id = 'tp-order-files'
  and public.get_current_user_role() = 'field_staff'
  and split_part(name, '/', 1) = 'branch'
  and split_part(name, '/', 3) = 'orders'
  and split_part(name, '/', 5) = 'expenses'
  and exists (
    select 1 from public.orders o
    where o.id = public.try_parse_uuid(split_part(name, '/', 4))
      and o.assigned_staff_id = auth.uid()
  )
);

drop policy if exists "field staff expense proof storage read" on storage.objects;
create policy "field staff expense proof storage read" on storage.objects
for select using (
  bucket_id = 'tp-order-files'
  and public.get_current_user_role() = 'field_staff'
  and split_part(name, '/', 1) = 'branch'
  and split_part(name, '/', 3) = 'orders'
  and split_part(name, '/', 5) = 'expenses'
  and exists (
    select 1 from public.orders o
    where o.id = public.try_parse_uuid(split_part(name, '/', 4))
      and o.assigned_staff_id = auth.uid()
  )
);

drop policy if exists "accountant expense proof storage read" on storage.objects;
create policy "accountant expense proof storage read" on storage.objects
for select using (
  bucket_id = 'tp-order-files'
  and public.get_current_user_role() = 'accountant'
  and split_part(name, '/', 1) = 'branch'
  and split_part(name, '/', 3) = 'orders'
  and split_part(name, '/', 5) = 'expenses'
);
