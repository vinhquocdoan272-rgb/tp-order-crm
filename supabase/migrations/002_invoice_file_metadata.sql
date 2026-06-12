alter table public.invoices
  add column if not exists file_name text,
  add column if not exists mime_type text,
  add column if not exists size_bytes bigint,
  add column if not exists uploaded_by uuid references public.profiles(id);

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

drop trigger if exists accountant_invoice_update on public.invoices;
create trigger accountant_invoice_update before update on public.invoices
for each row execute function public.enforce_accountant_invoice_update();

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
