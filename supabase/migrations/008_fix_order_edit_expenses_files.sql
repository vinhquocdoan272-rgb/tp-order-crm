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
  updated_at timestamptz default now()
);

alter table public.order_expenses
  drop constraint if exists staff_expense_requires_staff;

alter table public.order_expenses
  add constraint staff_expense_requires_staff check (paid_by <> 'staff' or paid_by_staff_id is not null);

create index if not exists order_expenses_order_id_idx on public.order_expenses(order_id);
create index if not exists order_expenses_branch_id_idx on public.order_expenses(branch_id);
create index if not exists order_expenses_paid_by_staff_id_idx on public.order_expenses(paid_by_staff_id);
create index if not exists order_expenses_expense_date_idx on public.order_expenses(expense_date);

alter table public.orders
  add column if not exists collected_by_type text not null default 'store',
  add column if not exists collected_by_staff_id uuid references public.profiles(id) on delete set null,
  add column if not exists collection_method text not null default 'Tiền mặt',
  add column if not exists handover_status text not null default 'Không cần nộp',
  add column if not exists handover_required_amount numeric(14,2) not null default 0,
  add column if not exists handover_paid_amount numeric(14,2) not null default 0,
  add column if not exists handover_remaining_amount numeric(14,2) not null default 0;

alter table public.orders
  drop constraint if exists orders_collected_by_type_check,
  drop constraint if exists orders_handover_status_check,
  drop constraint if exists orders_handover_amounts_check,
  drop constraint if exists orders_staff_collection_requires_staff;

alter table public.orders
  add constraint orders_collected_by_type_check check (collected_by_type in ('staff', 'store', 'owner', 'company_bank')),
  add constraint orders_handover_status_check check (handover_status in ('Chưa nộp', 'Nộp một phần', 'Đã nộp đủ', 'Không cần nộp')),
  add constraint orders_handover_amounts_check check (handover_required_amount >= 0 and handover_paid_amount >= 0 and handover_remaining_amount >= 0),
  add constraint orders_staff_collection_requires_staff check (collected_by_type <> 'staff' or collected_by_staff_id is not null);

create table if not exists public.order_handover_payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  branch_id uuid references public.branches(id),
  staff_id uuid references public.profiles(id) on delete set null,
  amount numeric(14,2) not null default 0 check (amount > 0),
  payment_date date default current_date,
  collection_method text default 'Tiền mặt',
  proof_file_url text,
  proof_file_path text,
  note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists order_handover_payments_order_id_idx on public.order_handover_payments(order_id);
create index if not exists order_handover_payments_branch_id_idx on public.order_handover_payments(branch_id);
create index if not exists order_handover_payments_staff_id_idx on public.order_handover_payments(staff_id);
create index if not exists order_handover_payments_payment_date_idx on public.order_handover_payments(payment_date);

create or replace function public.set_order_expense_branch()
returns trigger
language plpgsql
as $$
begin
  if new.branch_id is null then
    select branch_id into new.branch_id from public.orders where id = new.order_id;
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

create or replace function public.set_order_handover_payment_defaults()
returns trigger
language plpgsql
as $$
begin
  if new.branch_id is null then
    select branch_id into new.branch_id from public.orders where id = new.order_id;
  end if;
  if new.staff_id is null then
    select collected_by_staff_id into new.staff_id from public.orders where id = new.order_id;
  end if;
  return new;
end;
$$;

drop trigger if exists order_handover_payments_defaults on public.order_handover_payments;
create trigger order_handover_payments_defaults before insert or update on public.order_handover_payments
for each row execute function public.set_order_handover_payment_defaults();

drop trigger if exists order_handover_payments_updated_at on public.order_handover_payments;
create trigger order_handover_payments_updated_at before update on public.order_handover_payments
for each row execute function public.update_updated_at_column();

drop view if exists public.order_financial_summary cascade;
create view public.order_financial_summary as
with expense_totals as (
  select
    order_id,
    sum(amount) as total_expenses,
    sum(case when paid_by = 'staff' then amount else 0 end) as staff_paid_expenses,
    sum(case when paid_by = 'store' then amount else 0 end) as store_paid_expenses,
    sum(case when paid_by = 'owner' then amount else 0 end) as owner_paid_expenses
  from public.order_expenses
  group by order_id
),
handover_totals as (
  select order_id, sum(amount) as handover_paid_amount
  from public.order_handover_payments
  group by order_id
)
select
  o.id as order_id,
  o.branch_id,
  o.assigned_staff_id,
  o.collected_by_type,
  o.collected_by_staff_id,
  o.collection_method,
  coalesce(o.total_amount, 0)::numeric(14,2) as total_amount,
  coalesce(o.paid_amount, 0)::numeric(14,2) as paid_amount,
  coalesce(o.debt_amount, 0)::numeric(14,2) as debt_amount,
  coalesce(e.total_expenses, 0)::numeric(14,2) as total_expenses,
  coalesce(e.staff_paid_expenses, 0)::numeric(14,2) as staff_paid_expenses,
  coalesce(e.store_paid_expenses, 0)::numeric(14,2) as store_paid_expenses,
  coalesce(e.owner_paid_expenses, 0)::numeric(14,2) as owner_paid_expenses,
  (coalesce(o.paid_amount, 0) - coalesce(e.total_expenses, 0))::numeric(14,2) as net_profit,
  ((coalesce(o.paid_amount, 0) - coalesce(e.total_expenses, 0)) * 0.5)::numeric(14,2) as staff_profit_share,
  ((coalesce(o.paid_amount, 0) - coalesce(e.total_expenses, 0)) * 0.5)::numeric(14,2) as owner_profit_share,
  (((coalesce(o.paid_amount, 0) - coalesce(e.total_expenses, 0)) * 0.5) + coalesce(e.staff_paid_expenses, 0))::numeric(14,2) as staff_total_receivable,
  (((coalesce(o.paid_amount, 0) - coalesce(e.total_expenses, 0)) * 0.5) + coalesce(e.store_paid_expenses, 0) + coalesce(e.owner_paid_expenses, 0))::numeric(14,2) as owner_total_receivable,
  (case when o.collected_by_type = 'staff' then coalesce(o.paid_amount, 0) else 0 end)::numeric(14,2) as handover_required_amount,
  coalesce(h.handover_paid_amount, o.handover_paid_amount, 0)::numeric(14,2) as handover_paid_amount,
  greatest((case when o.collected_by_type = 'staff' then coalesce(o.paid_amount, 0) else 0 end) - coalesce(h.handover_paid_amount, o.handover_paid_amount, 0), 0)::numeric(14,2) as handover_remaining_amount,
  case
    when o.collected_by_type <> 'staff' or coalesce(o.paid_amount, 0) <= 0 then 'Không cần nộp'
    when coalesce(h.handover_paid_amount, o.handover_paid_amount, 0) <= 0 then 'Chưa nộp'
    when coalesce(h.handover_paid_amount, o.handover_paid_amount, 0) < coalesce(o.paid_amount, 0) then 'Nộp một phần'
    else 'Đã nộp đủ'
  end as handover_status
from public.orders o
left join expense_totals e on e.order_id = o.id
left join handover_totals h on h.order_id = o.id;

alter table public.order_expenses enable row level security;
alter table public.order_handover_payments enable row level security;

drop policy if exists "admin full order expenses" on public.order_expenses;
create policy "admin full order expenses" on public.order_expenses
for all using (public.get_current_user_role() = 'admin')
with check (public.get_current_user_role() = 'admin');

drop policy if exists "branch order expenses manage" on public.order_expenses;
create policy "branch order expenses manage" on public.order_expenses
for all using (public.get_current_user_role() = 'branch_manager' and branch_id = public.get_current_user_branch_id())
with check (branch_id = public.get_current_user_branch_id());

drop policy if exists "field staff assigned order expenses read" on public.order_expenses;
create policy "field staff assigned order expenses read" on public.order_expenses
for select using (
  public.get_current_user_role() = 'field_staff'
  and exists (select 1 from public.orders o where o.id = order_expenses.order_id and o.assigned_staff_id = auth.uid())
);

drop policy if exists "field staff assigned order expenses insert" on public.order_expenses;
create policy "field staff assigned order expenses insert" on public.order_expenses
for insert with check (
  public.get_current_user_role() = 'field_staff'
  and exists (select 1 from public.orders o where o.id = order_expenses.order_id and o.assigned_staff_id = auth.uid())
);

drop policy if exists "accountant order expenses read" on public.order_expenses;
create policy "accountant order expenses read" on public.order_expenses
for select using (public.get_current_user_role() = 'accountant');

drop policy if exists "admin full handover payments" on public.order_handover_payments;
create policy "admin full handover payments" on public.order_handover_payments
for all using (public.get_current_user_role() = 'admin')
with check (public.get_current_user_role() = 'admin');

drop policy if exists "branch handover payments manage" on public.order_handover_payments;
create policy "branch handover payments manage" on public.order_handover_payments
for all using (public.get_current_user_role() = 'branch_manager' and branch_id = public.get_current_user_branch_id())
with check (branch_id = public.get_current_user_branch_id());

drop policy if exists "field staff assigned handover payments read" on public.order_handover_payments;
create policy "field staff assigned handover payments read" on public.order_handover_payments
for select using (
  public.get_current_user_role() = 'field_staff'
  and exists (select 1 from public.orders o where o.id = order_handover_payments.order_id and o.assigned_staff_id = auth.uid())
);

drop policy if exists "field staff assigned handover payments insert" on public.order_handover_payments;
create policy "field staff assigned handover payments insert" on public.order_handover_payments
for insert with check (
  public.get_current_user_role() = 'field_staff'
  and exists (select 1 from public.orders o where o.id = order_handover_payments.order_id and o.assigned_staff_id = auth.uid())
);

drop policy if exists "accountant handover payments read" on public.order_handover_payments;
create policy "accountant handover payments read" on public.order_handover_payments
for select using (public.get_current_user_role() = 'accountant');
