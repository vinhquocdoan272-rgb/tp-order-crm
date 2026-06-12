-- Fix field_staff order insert RLS.
-- Supabase RLS can evaluate WITH CHECK before every payload/default path has created_by,
-- so insert permission must rely on role, branch_id and assigned_staff_id only.

alter table public.orders enable row level security;

drop policy if exists "field staff own branch orders insert" on public.orders;

create policy "field staff own branch orders insert" on public.orders
for insert with check (
  public.get_current_user_role() = 'field_staff'
  and branch_id = public.get_current_user_branch_id()
  and assigned_staff_id = auth.uid()
);
