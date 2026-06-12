-- Make order_code generation concurrency-safe and idempotent.
-- Existing max(order_code) + 1 logic can generate duplicates when inserts happen close together.

create sequence if not exists public.order_code_seq;

do $$
declare
  max_order_number bigint;
  current_sequence_number bigint;
begin
  select coalesce(max(substring(order_code from 3)::bigint), 0)
  into max_order_number
  from public.orders
  where order_code ~ '^DH[0-9]+$';

  select last_value
  into current_sequence_number
  from public.order_code_seq;

  perform setval(
    'public.order_code_seq',
    greatest(max_order_number, current_sequence_number),
    true
  );
end;
$$;

create or replace function public.generate_order_code()
returns text
language plpgsql
as $$
declare
  candidate text;
begin
  loop
    candidate := 'DH' || lpad(nextval('public.order_code_seq')::text, 6, '0');
    exit when not exists (
      select 1
      from public.orders
      where order_code = candidate
    );
  end loop;

  return candidate;
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

drop trigger if exists orders_code on public.orders;
create trigger orders_code before insert on public.orders
for each row execute function public.set_order_code();
