-- Admin-only order deletion.
-- Test A: admin sees Xóa and can delete an order; files/expenses/handover rows cascade; invoices stay with order_id set null.
-- Test B: branch_manager has no delete policy and should cancel by setting status = 'Hủy'.
-- Test C: field_staff has no delete policy and direct delete requests must fail.

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.order_files'::regclass
      and c.confrelid = 'public.orders'::regclass
      and c.contype = 'f'
  loop
    execute format('alter table public.order_files drop constraint if exists %I', constraint_name);
  end loop;

  for constraint_name in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.order_expenses'::regclass
      and c.confrelid = 'public.orders'::regclass
      and c.contype = 'f'
  loop
    execute format('alter table public.order_expenses drop constraint if exists %I', constraint_name);
  end loop;

  for constraint_name in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.order_handover_payments'::regclass
      and c.confrelid = 'public.orders'::regclass
      and c.contype = 'f'
  loop
    execute format('alter table public.order_handover_payments drop constraint if exists %I', constraint_name);
  end loop;

  for constraint_name in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.invoices'::regclass
      and c.confrelid = 'public.orders'::regclass
      and c.contype = 'f'
  loop
    execute format('alter table public.invoices drop constraint if exists %I', constraint_name);
  end loop;
end $$;

alter table public.order_files
  add constraint order_files_order_id_fkey
  foreign key (order_id) references public.orders(id) on delete cascade not valid;

alter table public.order_expenses
  add constraint order_expenses_order_id_fkey
  foreign key (order_id) references public.orders(id) on delete cascade not valid;

alter table public.order_handover_payments
  add constraint order_handover_payments_order_id_fkey
  foreign key (order_id) references public.orders(id) on delete cascade not valid;

alter table public.invoices
  add constraint invoices_order_id_fkey
  foreign key (order_id) references public.orders(id) on delete set null not valid;

drop policy if exists "branch orders delete" on public.orders;
drop policy if exists "admin orders delete" on public.orders;
create policy "admin orders delete" on public.orders
for delete using (public.get_current_user_role() = 'admin');

drop policy if exists "field staff assigned or created orders read" on public.orders;
create policy "field staff assigned or created orders read" on public.orders
for select using (
  public.get_current_user_role() = 'field_staff'
  and (assigned_staff_id = auth.uid() or created_by = auth.uid())
);

drop policy if exists "field staff own branch orders insert" on public.orders;
create policy "field staff own branch orders insert" on public.orders
for insert with check (
  public.get_current_user_role() = 'field_staff'
  and assigned_staff_id = auth.uid()
  and created_by = auth.uid()
  and branch_id = public.get_current_user_branch_id()
);

drop policy if exists "field staff assigned or created orders update" on public.orders;
create policy "field staff assigned or created orders update" on public.orders
for update using (
  public.get_current_user_role() = 'field_staff'
  and (assigned_staff_id = auth.uid() or created_by = auth.uid())
)
with check (
  public.get_current_user_role() = 'field_staff'
  and (assigned_staff_id = auth.uid() or created_by = auth.uid())
);

drop policy if exists "admin order files delete" on public.order_files;
create policy "admin order files delete" on public.order_files
for delete using (public.get_current_user_role() = 'admin');

drop policy if exists "admin order expenses delete" on public.order_expenses;
create policy "admin order expenses delete" on public.order_expenses
for delete using (public.get_current_user_role() = 'admin');

drop policy if exists "admin handover payments delete" on public.order_handover_payments;
create policy "admin handover payments delete" on public.order_handover_payments
for delete using (public.get_current_user_role() = 'admin');
