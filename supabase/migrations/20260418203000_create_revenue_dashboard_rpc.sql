begin;

create or replace function public.get_revenue_dashboard(
  contractor_id uuid default null,
  limit_count integer default 14
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result_total_revenue numeric(12,2) := 0;
  result_total_payments integer := 0;
  result_recent_payments jsonb := '[]'::jsonb;
begin
  with filtered_payments as (
    select
      tenant_id as contractor_id,
      created_at as paid_at,
      amount
    from public.payments
    where status = 'completed'
      and (contractor_id is null or tenant_id = contractor_id)
  )
  select
    count(*)::int,
    coalesce(sum(amount), 0)::numeric(12,2)
  into result_total_payments, result_total_revenue
  from filtered_payments;

  with filtered_payments as (
    select
      tenant_id as contractor_id,
      created_at as paid_at,
      amount
    from public.payments
    where status = 'completed'
      and (contractor_id is null or tenant_id = contractor_id)
  ),
  grouped_payments as (
    select
      date_trunc('day', paid_at)::date as day,
      contractor_id,
      count(*)::int as total_payments,
      coalesce(sum(amount), 0)::numeric(12,2) as total_revenue
    from filtered_payments
    group by 1, 2
    order by 1 desc, 2 asc
    limit greatest(coalesce(limit_count, 14), 1)
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'day', grouped_payments.day,
        'contractorId', grouped_payments.contractor_id,
        'totalRevenue', grouped_payments.total_revenue,
        'totalPayments', grouped_payments.total_payments
      )
    ),
    '[]'::jsonb
  )
  into result_recent_payments
  from grouped_payments;

  return jsonb_build_object(
    'totalRevenue', coalesce(result_total_revenue, 0),
    'totalPayments', coalesce(result_total_payments, 0),
    'recentPayments', coalesce(result_recent_payments, '[]'::jsonb)
  );
end;
$$;

grant execute on function public.get_revenue_dashboard(uuid, integer) to authenticated;
grant execute on function public.get_revenue_dashboard(uuid, integer) to service_role;

notify pgrst, 'reload schema';

commit;