alter table public.invoices
  add column if not exists file_name text,
  add column if not exists mime_type text,
  add column if not exists size_bytes bigint,
  add column if not exists linked_order_file_id uuid references public.order_files(id) on delete set null;

create index if not exists invoices_linked_order_file_id_idx on public.invoices(linked_order_file_id);

drop policy if exists "accountant invoices manage" on public.invoices;
create policy "accountant invoices manage" on public.invoices
for all using (public.get_current_user_role() = 'accountant')
with check (public.get_current_user_role() = 'accountant');

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
