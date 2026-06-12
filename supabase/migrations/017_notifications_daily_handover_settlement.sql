create table if not exists public.admin_notifications (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  message text not null,
  notification_type text not null,
  entity_type text not null,
  entity_id uuid,
  branch_id uuid references public.branches(id) on delete set null,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_role text,
  is_read boolean default false,
  metadata jsonb,
  created_at timestamptz default now()
);

alter table public.audit_logs
  add column if not exists old_data jsonb,
  add column if not exists new_data jsonb,
  add column if not exists branch_id uuid references public.branches(id) on delete set null;

create table if not exists public.daily_handover_settlements (
  id uuid primary key default gen_random_uuid(),
  settlement_code text unique not null,
  branch_id uuid references public.branches(id) on delete set null,
  staff_id uuid references public.profiles(id) on delete set null,
  settlement_date date not null default current_date,
  total_required_amount numeric(14,2) not null default 0,
  submitted_amount numeric(14,2) not null default 0,
  remaining_amount numeric(14,2) generated always as (total_required_amount - submitted_amount) stored,
  payment_method text not null default 'Chuyển khoản',
  status text not null default 'Chờ admin xác nhận',
  proof_file_url text,
  proof_file_path text,
  proof_file_name text,
  note text,
  admin_note text,
  confirmed_by uuid references public.profiles(id) on delete set null,
  confirmed_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint daily_handover_settlements_amounts_check check (total_required_amount >= 0 and submitted_amount >= 0),
  constraint daily_handover_settlements_status_check check (status in ('Chờ admin xác nhận', 'Đã xác nhận', 'Cần kiểm tra lại', 'Từ chối'))
);

create table if not exists public.daily_handover_settlement_orders (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references public.daily_handover_settlements(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  required_amount numeric(14,2) not null default 0,
  allocated_amount numeric(14,2) not null default 0,
  created_at timestamptz default now(),
  unique (settlement_id, order_id)
);

drop trigger if exists branch_manager_invoice_file_update on public.invoices;
drop function if exists public.enforce_branch_manager_invoice_file_update();

drop policy if exists "branch invoices update" on public.invoices;
create policy "branch invoices update" on public.invoices
for update using (
  public.get_current_user_role() = 'branch_manager'
  and branch_id = public.get_current_user_branch_id()
)
with check (
  public.get_current_user_role() = 'branch_manager'
  and branch_id = public.get_current_user_branch_id()
);

create index if not exists admin_notifications_unread_idx on public.admin_notifications(is_read, created_at desc);
create index if not exists admin_notifications_branch_id_idx on public.admin_notifications(branch_id);
create index if not exists daily_handover_settlements_branch_id_idx on public.daily_handover_settlements(branch_id);
create index if not exists daily_handover_settlements_staff_id_idx on public.daily_handover_settlements(staff_id);
create index if not exists daily_handover_settlements_date_idx on public.daily_handover_settlements(settlement_date);
create index if not exists daily_handover_settlement_orders_settlement_id_idx on public.daily_handover_settlement_orders(settlement_id);
create index if not exists daily_handover_settlement_orders_order_id_idx on public.daily_handover_settlement_orders(order_id);

create or replace function public.generate_settlement_code(settlement_date date default current_date)
returns text
language plpgsql
as $$
declare
  prefix text;
  sequence_number integer;
begin
  prefix := 'NT' || to_char(settlement_date, 'YYYYMMDD');
  select count(*) + 1
  into sequence_number
  from public.daily_handover_settlements
  where settlement_code like prefix || '%';

  return prefix || lpad(sequence_number::text, 4, '0');
end;
$$;

create or replace function public.set_settlement_code()
returns trigger
language plpgsql
as $$
begin
  if new.settlement_code is null or new.settlement_code = '' then
    new.settlement_code := public.generate_settlement_code(new.settlement_date);
  end if;
  return new;
end;
$$;

drop trigger if exists daily_handover_settlements_code on public.daily_handover_settlements;
create trigger daily_handover_settlements_code before insert on public.daily_handover_settlements
for each row execute function public.set_settlement_code();

drop trigger if exists daily_handover_settlements_updated_at on public.daily_handover_settlements;
create trigger daily_handover_settlements_updated_at before update on public.daily_handover_settlements
for each row execute function public.update_updated_at_column();

alter table public.admin_notifications enable row level security;
alter table public.daily_handover_settlements enable row level security;
alter table public.daily_handover_settlement_orders enable row level security;

drop policy if exists "admin full notifications" on public.admin_notifications;
create policy "admin full notifications" on public.admin_notifications
for all using (public.get_current_user_role() = 'admin')
with check (public.get_current_user_role() = 'admin');

drop policy if exists "authenticated insert notifications" on public.admin_notifications;
create policy "authenticated insert notifications" on public.admin_notifications
for insert with check (auth.uid() is not null);

drop policy if exists "branch managers view branch notifications" on public.admin_notifications;
create policy "branch managers view branch notifications" on public.admin_notifications
for select using (
  public.get_current_user_role() = 'branch_manager'
  and branch_id = public.get_current_user_branch_id()
);

drop policy if exists "admin full daily settlements" on public.daily_handover_settlements;
create policy "admin full daily settlements" on public.daily_handover_settlements
for all using (public.get_current_user_role() = 'admin')
with check (public.get_current_user_role() = 'admin');

drop policy if exists "branch daily settlements" on public.daily_handover_settlements;
create policy "branch daily settlements" on public.daily_handover_settlements
for all using (
  public.get_current_user_role() = 'branch_manager'
  and branch_id = public.get_current_user_branch_id()
)
with check (
  public.get_current_user_role() = 'branch_manager'
  and branch_id = public.get_current_user_branch_id()
);

drop policy if exists "field staff own daily settlements" on public.daily_handover_settlements;
create policy "field staff own daily settlements" on public.daily_handover_settlements
for all using (
  public.get_current_user_role() = 'field_staff'
  and staff_id = auth.uid()
)
with check (
  public.get_current_user_role() = 'field_staff'
  and staff_id = auth.uid()
  and created_by = auth.uid()
);

drop policy if exists "admin full settlement orders" on public.daily_handover_settlement_orders;
create policy "admin full settlement orders" on public.daily_handover_settlement_orders
for all using (public.get_current_user_role() = 'admin')
with check (public.get_current_user_role() = 'admin');

drop policy if exists "branch settlement orders" on public.daily_handover_settlement_orders;
create policy "branch settlement orders" on public.daily_handover_settlement_orders
for all using (
  public.get_current_user_role() = 'branch_manager'
  and exists (
    select 1 from public.daily_handover_settlements s
    where s.id = daily_handover_settlement_orders.settlement_id
      and s.branch_id = public.get_current_user_branch_id()
  )
)
with check (
  public.get_current_user_role() = 'branch_manager'
  and exists (
    select 1 from public.daily_handover_settlements s
    where s.id = daily_handover_settlement_orders.settlement_id
      and s.branch_id = public.get_current_user_branch_id()
  )
);

drop policy if exists "field staff own settlement orders" on public.daily_handover_settlement_orders;
create policy "field staff own settlement orders" on public.daily_handover_settlement_orders
for all using (
  public.get_current_user_role() = 'field_staff'
  and exists (
    select 1 from public.daily_handover_settlements s
    where s.id = daily_handover_settlement_orders.settlement_id
      and s.staff_id = auth.uid()
  )
)
with check (
  public.get_current_user_role() = 'field_staff'
  and exists (
    select 1 from public.daily_handover_settlements s
    where s.id = daily_handover_settlement_orders.settlement_id
      and s.staff_id = auth.uid()
  )
);

drop policy if exists "daily handover storage read" on storage.objects;
create policy "daily handover storage read" on storage.objects
for select using (
  bucket_id = 'tp-order-files'
  and split_part(name, '/', 3) = 'handover-settlements'
  and (
    public.get_current_user_role() = 'admin'
    or split_part(name, '/', 2) = public.get_current_user_branch_id()::text
  )
);

drop policy if exists "daily handover storage write" on storage.objects;
create policy "daily handover storage write" on storage.objects
for insert with check (
  bucket_id = 'tp-order-files'
  and split_part(name, '/', 3) = 'handover-settlements'
  and (
    public.get_current_user_role() = 'admin'
    or split_part(name, '/', 2) = public.get_current_user_branch_id()::text
  )
);
