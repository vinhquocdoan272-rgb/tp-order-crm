-- Fix staff handover calculation to follow the 50/50 profit sharing rule.
-- Test A: paid_amount 900000, staff expense 300000 -> handover_required_amount 300000.
-- Test B: paid_amount 900000, store expense 300000 -> handover_required_amount 600000.
-- Test C: paid_amount 900000, staff expense 200000, store expense 100000 -> handover_required_amount 400000.

create or replace view public.order_financial_summary as
with expense_totals as (
  select
    order_id,
    coalesce(sum(amount), 0) as total_expenses,
    coalesce(sum(case when paid_by = 'staff' then amount else 0 end), 0) as staff_paid_expenses,
    coalesce(sum(case when paid_by = 'store' then amount else 0 end), 0) as store_paid_expenses,
    coalesce(sum(case when paid_by = 'owner' then amount else 0 end), 0) as owner_paid_expenses
  from public.order_expenses
  group by order_id
),
handover_totals as (
  select
    order_id,
    coalesce(sum(amount), 0) as handover_paid_amount
  from public.order_handover_payments
  group by order_id
),
summary_base as (
  select
    o.id as order_id,
    o.branch_id,
    o.assigned_staff_id,
    o.collected_by_type,
    o.collected_by_staff_id,
    o.collection_method,
    coalesce(o.total_amount, 0) as total_amount,
    coalesce(o.paid_amount, 0) as paid_amount,
    coalesce(o.debt_amount, 0) as debt_amount,
    coalesce(e.total_expenses, 0) as total_expenses,
    coalesce(e.staff_paid_expenses, 0) as staff_paid_expenses,
    coalesce(e.store_paid_expenses, 0) as store_paid_expenses,
    coalesce(e.owner_paid_expenses, 0) as owner_paid_expenses,
    coalesce(h.handover_paid_amount, o.handover_paid_amount, 0) as handover_paid_amount
  from public.orders o
  left join expense_totals e on e.order_id = o.id
  left join handover_totals h on h.order_id = o.id
),
calculated as (
  select
    *,
    (paid_amount - total_expenses) as net_profit,
    ((paid_amount - total_expenses) * 0.5) as staff_profit_share,
    ((paid_amount - total_expenses) * 0.5) as owner_profit_share,
    (store_paid_expenses + owner_paid_expenses) as owner_fronted_expenses
  from summary_base
),
finalized as (
  select
    *,
    (staff_profit_share + staff_paid_expenses) as staff_total_receivable,
    (owner_profit_share + owner_fronted_expenses) as owner_total_receivable,
    case
      when collected_by_type = 'staff' then greatest(owner_profit_share + owner_fronted_expenses, 0)
      else 0
    end as handover_required_amount
  from calculated
)
select
  order_id,
  branch_id,
  assigned_staff_id,
  collected_by_type,
  collected_by_staff_id,
  collection_method,
  total_amount::numeric(14,2) as total_amount,
  paid_amount::numeric(14,2) as paid_amount,
  debt_amount::numeric(14,2) as debt_amount,
  total_expenses::numeric(14,2) as total_expenses,
  staff_paid_expenses::numeric(14,2) as staff_paid_expenses,
  store_paid_expenses::numeric(14,2) as store_paid_expenses,
  owner_paid_expenses::numeric(14,2) as owner_paid_expenses,
  net_profit::numeric(14,2) as net_profit,
  staff_profit_share::numeric(14,2) as staff_profit_share,
  owner_profit_share::numeric(14,2) as owner_profit_share,
  staff_total_receivable::numeric(14,2) as staff_total_receivable,
  owner_total_receivable::numeric(14,2) as owner_total_receivable,
  handover_required_amount::numeric(14,2) as handover_required_amount,
  handover_paid_amount::numeric(14,2) as handover_paid_amount,
  greatest(handover_required_amount - handover_paid_amount, 0)::numeric(14,2) as handover_remaining_amount,
  case
    when collected_by_type <> 'staff' then 'Không cần nộp'
    when handover_required_amount <= 0 then 'Đã nộp đủ'
    when handover_paid_amount = 0 and handover_required_amount > 0 then 'Chưa nộp'
    when handover_paid_amount > 0 and handover_paid_amount < handover_required_amount then 'Nộp một phần'
    when handover_paid_amount >= handover_required_amount then 'Đã nộp đủ'
    else 'Không cần nộp'
  end as handover_status
from finalized;
