-- Full public-schema RLS audit (one row per table)
select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced,
  coalesce(p.policy_count, 0)::int as policy_count,
  coalesce(p.anon_policies, 0)::int as anon_policies,
  coalesce(p.authenticated_policies, 0)::int as authenticated_policies,
  has_table_privilege('anon', c.oid, 'SELECT') as anon_select_grant,
  has_table_privilege('authenticated', c.oid, 'SELECT') as auth_select_grant
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join lateral (
  select
    count(*)::int as policy_count,
    count(*) filter (where 'anon' = any (pol.roles))::int as anon_policies,
    count(*) filter (where 'authenticated' = any (pol.roles))::int as authenticated_policies
  from pg_policies pol
  where pol.schemaname = 'public'
    and pol.tablename = c.relname
) p on true
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname not like 'pg_%'
  and c.relname not like 'sql_%'
order by c.relname;
