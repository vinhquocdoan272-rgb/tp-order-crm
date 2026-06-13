-- Make customer_code generation concurrency-safe and idempotent.
-- Existing max(customer_code) + 1 logic can generate duplicates when inserts happen close together.

create sequence if not exists public.customer_code_seq;

do $$
declare
  max_customer_number bigint;
  current_sequence_number bigint;
begin
  select coalesce(max(substring(customer_code from 3)::bigint), 0)
  into max_customer_number
  from public.customers
  where customer_code ~ '^KH[0-9]+$';

  select last_value
  into current_sequence_number
  from public.customer_code_seq;

  perform setval(
    'public.customer_code_seq',
    greatest(max_customer_number, current_sequence_number),
    true
  );
end;
$$;

create or replace function public.generate_customer_code()
returns text
language plpgsql
as $$
declare
  candidate text;
begin
  loop
    candidate := 'KH' || lpad(nextval('public.customer_code_seq')::text, 6, '0');
    exit when not exists (
      select 1
      from public.customers
      where customer_code = candidate
    );
  end loop;

  return candidate;
end;
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

drop trigger if exists customers_code on public.customers;
create trigger customers_code before insert on public.customers
for each row execute function public.set_customer_code();
