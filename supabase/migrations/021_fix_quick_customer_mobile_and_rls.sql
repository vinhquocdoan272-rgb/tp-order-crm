-- Fix quick customer creation RLS for mobile order form.
-- Idempotent and data-safe: only replaces customer policies.

alter table public.customers enable row level security;

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
  and (assigned_staff_id = auth.uid() or assigned_staff_id is null)
  and (created_by = auth.uid() or created_by is null)
);

create policy "field staff own customers update" on public.customers
for update using (
  public.get_current_user_role() = 'field_staff'
  and branch_id = public.get_current_user_branch_id()
  and (created_by = auth.uid() or assigned_staff_id = auth.uid())
) with check (
  public.get_current_user_role() = 'field_staff'
  and branch_id = public.get_current_user_branch_id()
  and (assigned_staff_id = auth.uid() or assigned_staff_id is null)
  and (created_by = auth.uid() or created_by is null)
);
