create extension if not exists "pgcrypto";

create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  phone text,
  manager_name text,
  note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  phone text,
  role text not null check (role in ('admin', 'branch_manager', 'field_staff', 'accountant')),
  branch_id uuid references public.branches(id),
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  customer_code text unique not null,
  name text not null,
  phone text not null,
  address text,
  customer_type text not null default 'Cá nhân',
  branch_id uuid references public.branches(id),
  note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_code text unique not null,
  customer_id uuid references public.customers(id) on delete restrict,
  branch_id uuid references public.branches(id),
  assigned_staff_id uuid references public.profiles(id),
  service_type text not null,
  status text not null default 'Mới tạo',
  payment_status text not null default 'Chưa thu',
  request_description text,
  technical_note text,
  total_amount numeric(14,2) default 0 check (total_amount >= 0),
  paid_amount numeric(14,2) default 0 check (paid_amount >= 0),
  debt_amount numeric(14,2) generated always as (total_amount - paid_amount) stored,
  order_date date default current_date,
  completed_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint paid_not_greater_than_total check (paid_amount <= total_amount)
);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_code text unique not null,
  invoice_type text not null check (invoice_type in ('Đầu vào', 'Đầu ra')),
  order_id uuid references public.orders(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  branch_id uuid references public.branches(id),
  supplier_name text,
  amount numeric(14,2) default 0 check (amount >= 0),
  invoice_date date default current_date,
  content text,
  file_url text,
  file_path text,
  file_name text,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid references public.profiles(id),
  note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.order_files (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete cascade,
  file_type text not null default 'Khác',
  file_name text,
  file_url text not null,
  file_path text not null,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb,
  created_at timestamptz default now()
);

create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.try_parse_uuid(value text)
returns uuid
language plpgsql
immutable
as $$
begin
  return value::uuid;
exception
  when others then
    return null;
end;
$$;

create or replace function public.generate_customer_code()
returns text
language plpgsql
as $$
declare
  next_number bigint;
begin
  select coalesce(max(substring(customer_code from 3)::bigint), 0) + 1
  into next_number
  from public.customers
  where customer_code ~ '^KH[0-9]+$';

  return 'KH' || lpad(next_number::text, 6, '0');
end;
$$;

create or replace function public.generate_order_code()
returns text
language plpgsql
as $$
declare
  next_number bigint;
begin
  select coalesce(max(substring(order_code from 3)::bigint), 0) + 1
  into next_number
  from public.orders
  where order_code ~ '^DH[0-9]+$';

  return 'DH' || lpad(next_number::text, 6, '0');
end;
$$;

create or replace function public.generate_invoice_code(invoice_type_value text default 'Đầu ra')
returns text
language plpgsql
as $$
declare
  prefix text;
  next_number bigint;
begin
  prefix := case when invoice_type_value = 'Đầu vào' then 'HDV' else 'HDR' end;

  select coalesce(max(substring(invoice_code from 4)::bigint), 0) + 1
  into next_number
  from public.invoices
  where invoice_code like prefix || '%';

  return prefix || lpad(next_number::text, 6, '0');
end;
$$;

create or replace function public.get_current_user_role()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select role from public.profiles where id = auth.uid() and is_active = true
$$;

create or replace function public.get_current_user_branch_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select branch_id from public.profiles where id = auth.uid() and is_active = true
$$;

create or replace function public.set_customer_code()
returns trigger
language plpgsql
as $$
begin
  if new.customer_code is null or new.customer_code = '' then
    new.customer_code := public.generate_customer_code();
  end if;
  return new;
end;
$$;

create or replace function public.set_order_code()
returns trigger
language plpgsql
as $$
begin
  if new.order_code is null or new.order_code = '' then
    new.order_code := public.generate_order_code();
  end if;
  return new;
end;
$$;

create or replace function public.set_invoice_code()
returns trigger
language plpgsql
as $$
begin
  if new.invoice_code is null or new.invoice_code = '' then
    new.invoice_code := public.generate_invoice_code(new.invoice_type);
  end if;
  return new;
end;
$$;

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
      raise exception 'Field staff can only update status, technical_note, and completed_at';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.enforce_accountant_invoice_update()
returns trigger
language plpgsql
as $$
begin
  if public.get_current_user_role() = 'accountant' then
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
      or new.created_by is distinct from old.created_by then
      raise exception 'Accountants can only update invoice note and file fields';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists branches_updated_at on public.branches;
create trigger branches_updated_at before update on public.branches
for each row execute function public.update_updated_at_column();

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles
for each row execute function public.update_updated_at_column();

drop trigger if exists customers_updated_at on public.customers;
create trigger customers_updated_at before update on public.customers
for each row execute function public.update_updated_at_column();

drop trigger if exists orders_updated_at on public.orders;
create trigger orders_updated_at before update on public.orders
for each row execute function public.update_updated_at_column();

drop trigger if exists invoices_updated_at on public.invoices;
create trigger invoices_updated_at before update on public.invoices
for each row execute function public.update_updated_at_column();

drop trigger if exists customers_code on public.customers;
create trigger customers_code before insert on public.customers
for each row execute function public.set_customer_code();

drop trigger if exists orders_code on public.orders;
create trigger orders_code before insert on public.orders
for each row execute function public.set_order_code();

drop trigger if exists invoices_code on public.invoices;
create trigger invoices_code before insert on public.invoices
for each row execute function public.set_invoice_code();

drop trigger if exists field_staff_order_update on public.orders;
create trigger field_staff_order_update before update on public.orders
for each row execute function public.enforce_field_staff_order_update();

drop trigger if exists accountant_invoice_update on public.invoices;
create trigger accountant_invoice_update before update on public.invoices
for each row execute function public.enforce_accountant_invoice_update();

alter table public.branches enable row level security;
alter table public.profiles enable row level security;
alter table public.customers enable row level security;
alter table public.orders enable row level security;
alter table public.invoices enable row level security;
alter table public.order_files enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists "admin full branches" on public.branches;
create policy "admin full branches" on public.branches
for all using (public.get_current_user_role() = 'admin')
with check (public.get_current_user_role() = 'admin');

drop policy if exists "staff view own branch" on public.branches;
create policy "staff view own branch" on public.branches
for select using (
  id = public.get_current_user_branch_id()
  or public.get_current_user_role() = 'accountant'
);

drop policy if exists "admin full profiles" on public.profiles;
create policy "admin full profiles" on public.profiles
for all using (public.get_current_user_role() = 'admin')
with check (public.get_current_user_role() = 'admin');

drop policy if exists "users view self" on public.profiles;
create policy "users view self" on public.profiles
for select using (id = auth.uid());

drop policy if exists "branch managers view branch profiles" on public.profiles;
create policy "branch managers view branch profiles" on public.profiles
for select using (
  public.get_current_user_role() = 'branch_manager'
  and branch_id = public.get_current_user_branch_id()
);

drop policy if exists "accountants view profiles" on public.profiles;
create policy "accountants view profiles" on public.profiles
for select using (public.get_current_user_role() = 'accountant');

drop policy if exists "admin full customers" on public.customers;
create policy "admin full customers" on public.customers
for all using (public.get_current_user_role() = 'admin')
with check (public.get_current_user_role() = 'admin');

drop policy if exists "branch customer read" on public.customers;
create policy "branch customer read" on public.customers
for select using (
  public.get_current_user_role() = 'branch_manager'
  and branch_id = public.get_current_user_branch_id()
);

drop policy if exists "branch customer insert" on public.customers;
create policy "branch customer insert" on public.customers
for insert with check (
  public.get_current_user_role() = 'branch_manager'
  and branch_id = public.get_current_user_branch_id()
);

drop policy if exists "branch customer update" on public.customers;
create policy "branch customer update" on public.customers
for update using (
  public.get_current_user_role() = 'branch_manager'
  and branch_id = public.get_current_user_branch_id()
) with check (branch_id = public.get_current_user_branch_id());

drop policy if exists "staff customer via assigned order" on public.customers;
create policy "staff customer via assigned order" on public.customers
for select using (
  public.get_current_user_role() = 'field_staff'
  and exists (
    select 1 from public.orders o
    where o.customer_id = customers.id
      and o.assigned_staff_id = auth.uid()
  )
);

drop policy if exists "accountant customers read" on public.customers;
create policy "accountant customers read" on public.customers
for select using (public.get_current_user_role() = 'accountant');

drop policy if exists "admin full orders" on public.orders;
create policy "admin full orders" on public.orders
for all using (public.get_current_user_role() = 'admin')
with check (public.get_current_user_role() = 'admin');

drop policy if exists "branch orders read" on public.orders;
create policy "branch orders read" on public.orders
for select using (
  public.get_current_user_role() = 'branch_manager'
  and branch_id = public.get_current_user_branch_id()
);

drop policy if exists "branch orders insert" on public.orders;
create policy "branch orders insert" on public.orders
for insert with check (
  public.get_current_user_role() = 'branch_manager'
  and branch_id = public.get_current_user_branch_id()
);

drop policy if exists "branch orders update" on public.orders;
create policy "branch orders update" on public.orders
for update using (
  public.get_current_user_role() = 'branch_manager'
  and branch_id = public.get_current_user_branch_id()
) with check (branch_id = public.get_current_user_branch_id());

drop policy if exists "staff assigned orders read" on public.orders;
create policy "staff assigned orders read" on public.orders
for select using (
  public.get_current_user_role() = 'field_staff'
  and assigned_staff_id = auth.uid()
);

drop policy if exists "staff assigned orders update" on public.orders;
create policy "staff assigned orders update" on public.orders
for update using (
  public.get_current_user_role() = 'field_staff'
  and assigned_staff_id = auth.uid()
) with check (assigned_staff_id = auth.uid());

drop policy if exists "accountant orders read" on public.orders;
create policy "accountant orders read" on public.orders
for select using (public.get_current_user_role() = 'accountant');

drop policy if exists "admin full invoices" on public.invoices;
create policy "admin full invoices" on public.invoices
for all using (public.get_current_user_role() = 'admin')
with check (public.get_current_user_role() = 'admin');

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

drop policy if exists "branch invoices update" on public.invoices;
create policy "branch invoices update" on public.invoices
for update using (
  public.get_current_user_role() = 'branch_manager'
  and branch_id = public.get_current_user_branch_id()
) with check (branch_id = public.get_current_user_branch_id());

drop policy if exists "accountant invoices read" on public.invoices;
create policy "accountant invoices read" on public.invoices
for select using (public.get_current_user_role() = 'accountant');

drop policy if exists "accountant invoices update" on public.invoices;
create policy "accountant invoices update" on public.invoices
for update using (public.get_current_user_role() = 'accountant')
with check (public.get_current_user_role() = 'accountant');

drop policy if exists "admin full order files" on public.order_files;
create policy "admin full order files" on public.order_files
for all using (public.get_current_user_role() = 'admin')
with check (public.get_current_user_role() = 'admin');

drop policy if exists "branch order files read" on public.order_files;
create policy "branch order files read" on public.order_files
for select using (
  public.get_current_user_role() = 'branch_manager'
  and exists (
    select 1 from public.orders o
    where o.id = order_files.order_id
      and o.branch_id = public.get_current_user_branch_id()
  )
);

drop policy if exists "branch order files insert" on public.order_files;
create policy "branch order files insert" on public.order_files
for insert with check (
  public.get_current_user_role() = 'branch_manager'
  and exists (
    select 1 from public.orders o
    where o.id = order_files.order_id
      and o.branch_id = public.get_current_user_branch_id()
  )
);

drop policy if exists "staff order files read" on public.order_files;
create policy "staff order files read" on public.order_files
for select using (
  public.get_current_user_role() = 'field_staff'
  and exists (
    select 1 from public.orders o
    where o.id = order_files.order_id
      and o.assigned_staff_id = auth.uid()
  )
);

drop policy if exists "staff order files insert" on public.order_files;
create policy "staff order files insert" on public.order_files
for insert with check (
  public.get_current_user_role() = 'field_staff'
  and exists (
    select 1 from public.orders o
    where o.id = order_files.order_id
      and o.assigned_staff_id = auth.uid()
  )
);

drop policy if exists "accountant order files read" on public.order_files;
create policy "accountant order files read" on public.order_files
for select using (public.get_current_user_role() = 'accountant');

drop policy if exists "admin audit read" on public.audit_logs;
create policy "admin audit read" on public.audit_logs
for select using (public.get_current_user_role() = 'admin');

drop policy if exists "audit insert authenticated" on public.audit_logs;
create policy "audit insert authenticated" on public.audit_logs
for insert with check (auth.uid() is not null);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tp-order-files',
  'tp-order-files',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "admin storage full" on storage.objects;
create policy "admin storage full" on storage.objects
for all
using (
  bucket_id = 'tp-order-files'
  and public.get_current_user_role() = 'admin'
)
with check (
  bucket_id = 'tp-order-files'
  and public.get_current_user_role() = 'admin'
);

drop policy if exists "branch storage read" on storage.objects;
create policy "branch storage read" on storage.objects
for select using (
  bucket_id = 'tp-order-files'
  and public.get_current_user_role() = 'branch_manager'
  and split_part(name, '/', 1) = 'branch'
  and public.try_parse_uuid(split_part(name, '/', 2)) = public.get_current_user_branch_id()
);

drop policy if exists "branch storage write" on storage.objects;
create policy "branch storage write" on storage.objects
for insert with check (
  bucket_id = 'tp-order-files'
  and public.get_current_user_role() = 'branch_manager'
  and split_part(name, '/', 1) = 'branch'
  and public.try_parse_uuid(split_part(name, '/', 2)) = public.get_current_user_branch_id()
);

drop policy if exists "accountant storage read" on storage.objects;
create policy "accountant storage read" on storage.objects
for select using (
  bucket_id = 'tp-order-files'
  and public.get_current_user_role() = 'accountant'
);

drop policy if exists "field staff storage read assigned orders" on storage.objects;
create policy "field staff storage read assigned orders" on storage.objects
for select using (
  bucket_id = 'tp-order-files'
  and public.get_current_user_role() = 'field_staff'
  and split_part(name, '/', 1) = 'branch'
  and split_part(name, '/', 3) = 'orders'
  and exists (
    select 1 from public.orders o
    where o.id = public.try_parse_uuid(split_part(name, '/', 4))
      and o.assigned_staff_id = auth.uid()
  )
);

drop policy if exists "field staff storage upload assigned orders" on storage.objects;
create policy "field staff storage upload assigned orders" on storage.objects
for insert with check (
  bucket_id = 'tp-order-files'
  and public.get_current_user_role() = 'field_staff'
  and split_part(name, '/', 1) = 'branch'
  and split_part(name, '/', 3) = 'orders'
  and exists (
    select 1 from public.orders o
    where o.id = public.try_parse_uuid(split_part(name, '/', 4))
      and o.assigned_staff_id = auth.uid()
  )
);

drop policy if exists "accountant storage upload invoice files" on storage.objects;
create policy "accountant storage upload invoice files" on storage.objects
for insert with check (
  bucket_id = 'tp-order-files'
  and public.get_current_user_role() = 'accountant'
  and split_part(name, '/', 1) = 'branch'
  and split_part(name, '/', 3) = 'invoices'
  and exists (
    select 1 from public.invoices i
    where i.id = public.try_parse_uuid(split_part(name, '/', 4))
  )
);
