-- Jobber CRM child tables were created without RLS (20260528140000).
-- Supabase Security Advisor: rls_disabled_in_public on client_* tables.
--
-- All app access uses supabaseAdmin (service role). Policies allow authenticated
-- tenant members via PostgREST if the browser anon key is used directly.

begin;

do $$
declare
  tbl text;
  jobber_client_tables text[] := array[
    'client_properties',
    'client_notes',
    'client_visits',
    'client_requests'
  ];
begin
  foreach tbl in array jobber_client_tables loop
    if not exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = tbl
    ) then
      continue;
    end if;

    execute format('alter table public.%I enable row level security', tbl);
    execute format('alter table public.%I force row level security', tbl);

    if exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = tbl
    ) then
      continue;
    end if;

    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_tenant_member(tenant_id))',
      tbl || '_tenant_select',
      tbl
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.is_tenant_member(tenant_id))',
      tbl || '_tenant_insert',
      tbl
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (public.is_tenant_member(tenant_id)) with check (public.is_tenant_member(tenant_id))',
      tbl || '_tenant_update',
      tbl
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.is_tenant_member(tenant_id) and public.is_admin_profile())',
      tbl || '_tenant_delete',
      tbl
    );
  end loop;
end $$;

-- Legacy/orphan table: RLS on with zero policies = service-role-only (block anon).
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'estimate_items'
  ) then
    alter table public.estimate_items enable row level security;
    alter table public.estimate_items force row level security;
  end if;
end $$;

notify pgrst, 'reload schema';

commit;
