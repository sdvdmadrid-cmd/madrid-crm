-- Drop old broken version first (parameter name changed so we need to drop by exact signature)
drop function if exists public.get_revenue_dashboard(uuid, integer);

create or replace function public.get_revenue_dashboard(
  p_contractor_id uuid default null,
  p_limit_count integer default 14
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total_revenue numeric(12,2) := 0;
  v_total_payments integer := 0;
  v_recent_payments jsonb := '[]'::jsonb;
begin
  select
    count(*)::int,
    coalesce(sum(p.amount), 0)::numeric(12,2)
  into v_total_payments, v_total_revenue
  from public.payments p
  where p.status = 'completed'
    and (p_contractor_id is null or p.tenant_id = p_contractor_id);

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'day', g.day,
        'contractorId', g.tid,
        'totalRevenue', g.total_revenue,
        'totalPayments', g.total_payments
      )
    ),
    '[]'::jsonb
  )
  into v_recent_payments
  from (
    select
      date_trunc('day', p.created_at)::date as day,
      p.tenant_id as tid,
      count(*)::int as total_payments,
      coalesce(sum(p.amount), 0)::numeric(12,2) as total_revenue
    from public.payments p
    where p.status = 'completed'
      and (p_contractor_id is null or p.tenant_id = p_contractor_id)
    group by 1, 2
    order by 1 desc, 2 asc
    limit greatest(coalesce(p_limit_count, 14), 1)
  ) g;

  return jsonb_build_object(
    'totalRevenue', coalesce(v_total_revenue, 0),
    'totalPayments', coalesce(v_total_payments, 0),
    'recentPayments', coalesce(v_recent_payments, '[]'::jsonb)
  );
end;
$$;

grant execute on function public.get_revenue_dashboard(uuid, integer) to authenticated;
grant execute on function public.get_revenue_dashboard(uuid, integer) to service_role;

notify pgrst, 'reload schema';