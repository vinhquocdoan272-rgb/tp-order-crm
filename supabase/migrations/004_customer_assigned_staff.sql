alter table public.customers
  add column if not exists assigned_staff_id uuid references public.profiles(id) on delete set null;

create index if not exists customers_assigned_staff_id_idx
  on public.customers(assigned_staff_id);

drop policy if exists "staff customer via assigned order" on public.customers;
create policy "staff customer via assigned order" on public.customers
for select using (
  public.get_current_user_role() = 'field_staff'
  and (
    assigned_staff_id = auth.uid()
    or exists (
      select 1 from public.orders o
      where o.customer_id = customers.id
        and o.assigned_staff_id = auth.uid()
    )
  )
);
