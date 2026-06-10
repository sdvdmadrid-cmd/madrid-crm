-- Public tables exposed via PostgREST without RLS (should return zero rows)
select c.relname as table_name
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and not c.relrowsecurity
  and c.relname not like 'pg_%'
order by 1;
