-- Enforce strict multi-tenant + owner-level RLS for SQL migration readiness.
-- Strategy:
-- 1) Keep RLS enabled/forced.
-- 2) Recreate policies per table based on available columns.
-- 3) If table has tenant_id + user_id -> require BOTH tenant membership and row ownership.
-- 4) If table has only user_id -> require row ownership.

begin;

create or replace function public.request_tenant_id()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(auth.jwt() ->> 'tenant_id', ''),
    nullif(auth.jwt() -> 'app_metadata' ->> 'tenant_id', ''),
    nullif(auth.jwt() -> 'app_metadata' ->> 'tenantId', ''),
    nullif(auth.jwt() -> 'user_metadata' ->> 'tenant_id', ''),
    nullif(auth.jwt() -> 'user_metadata' ->> 'tenantId', '')
  );
$$;

create or replace function public.is_row_owner(row_user_id uuid)
returns boolean
language sql
stable
as $$
  select auth.uid() is not null and row_user_id = auth.uid();
$$;

create or replace function public.is_tenant_member(row_tenant_id text)
returns boolean
language sql
stable
as $$
  select public.request_tenant_id() is not null
     and row_tenant_id is not null
     and row_tenant_id = public.request_tenant_id();
$$;

do $$
declare
  tbl text;
  pol record;
  has_user_id boolean;
  has_tenant_id boolean;
  target_tables text[] := array[
    'clients',
    'estimates',
    'jobs',
    'payments',
    'invoices',
    'contracts',
    'appointments',
    'quotes',
    'estimate_requests',
    'services_catalog',
    'company_profiles',
    'notifications'
  ];
begin
  foreach tbl in array target_tables loop
    if exists (
      select 1
      from information_schema.tables
      where table_schema = 'public'
        and table_name = tbl
    ) then
      execute format('alter table public.%I enable row level security', tbl);
      execute format('alter table public.%I force row level security', tbl);

      select exists (
          select 1
          from information_schema.columns
          where table_schema = 'public'
            and table_name = tbl
            and column_name = 'user_id'
        )
      into has_user_id;

      select exists (
          select 1
          from information_schema.columns
          where table_schema = 'public'
            and table_name = tbl
            and column_name = 'tenant_id'
        )
      into has_tenant_id;

      for pol in
        select policyname
        from pg_policies
        where schemaname = 'public'
          and tablename = tbl
      loop
        execute format('drop policy if exists %I on public.%I', pol.policyname, tbl);
      end loop;

      if has_user_id and has_tenant_id then
        execute format(
          'create policy %I on public.%I for select to authenticated using (public.is_row_owner(user_id) and public.is_tenant_member(tenant_id::text))',
          tbl || '_select_owner_tenant_strict',
          tbl
        );

        execute format(
          'create policy %I on public.%I for insert to authenticated with check (public.is_row_owner(user_id) and public.is_tenant_member(tenant_id::text))',
          tbl || '_insert_owner_tenant_strict',
          tbl
        );

        execute format(
          'create policy %I on public.%I for update to authenticated using (public.is_row_owner(user_id) and public.is_tenant_member(tenant_id::text)) with check (public.is_row_owner(user_id) and public.is_tenant_member(tenant_id::text))',
          tbl || '_update_owner_tenant_strict',
          tbl
        );

        execute format(
          'create policy %I on public.%I for delete to authenticated using (public.is_row_owner(user_id) and public.is_tenant_member(tenant_id::text))',
          tbl || '_delete_owner_tenant_strict',
          tbl
        );
      elsif has_user_id then
        execute format(
          'create policy %I on public.%I for select to authenticated using (public.is_row_owner(user_id))',
          tbl || '_select_owner_strict',
          tbl
        );

        execute format(
          'create policy %I on public.%I for insert to authenticated with check (public.is_row_owner(user_id))',
          tbl || '_insert_owner_strict',
          tbl
        );

        execute format(
          'create policy %I on public.%I for update to authenticated using (public.is_row_owner(user_id)) with check (public.is_row_owner(user_id))',
          tbl || '_update_owner_strict',
          tbl
        );

        execute format(
          'create policy %I on public.%I for delete to authenticated using (public.is_row_owner(user_id))',
          tbl || '_delete_owner_strict',
          tbl
        );
      end if;
    end if;
  end loop;
end $$;

commit;
