-- Reintroduce tenant-aware RLS incrementally without disturbing working migrations.
-- Phase 1: owner-only restrictive guards on tables that have user_id.
-- Phase 2: tenant-aware restrictive guards on tables that also have tenant_id.

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
    nullif(auth.jwt() -> 'user_metadata' ->> 'tenantId', ''),
    (
      select p.tenant_id::text
      from public.profiles p
      where p.id = auth.uid()
      limit 1
    ),
    auth.uid()::text
  );
$$;

create or replace function public.request_user_role()
returns text
language sql
stable
as $$
  select lower(coalesce(
    (
      select p.role
      from public.profiles p
      where p.id = auth.uid()
      limit 1
    ),
    auth.jwt() ->> 'role',
    auth.jwt() -> 'app_metadata' ->> 'role',
    auth.jwt() -> 'user_metadata' ->> 'role',
    'worker'
  ));
$$;

create or replace function public.is_row_owner(row_user_id uuid)
returns boolean
language sql
stable
as $$
  select auth.uid() is not null
    and row_user_id is not null
    and row_user_id = auth.uid();
$$;

create or replace function public.is_row_owner(owner_user_id text)
returns boolean
language sql
stable
as $$
  select auth.uid() is not null
    and nullif(btrim(owner_user_id), '') is not null
    and owner_user_id = auth.uid()::text;
$$;

create or replace function public.is_tenant_member(member_tenant_id uuid)
returns boolean
language sql
stable
as $$
  select public.request_tenant_id() is not null
    and member_tenant_id is not null
    and member_tenant_id::text = public.request_tenant_id();
$$;

create or replace function public.is_tenant_member(row_tenant_id text)
returns boolean
language sql
stable
as $$
  select public.request_tenant_id() is not null
    and nullif(btrim(row_tenant_id), '') is not null
    and row_tenant_id = public.request_tenant_id();
$$;

do $$
declare
  tbl text;
  has_user_id boolean;
  has_tenant_id boolean;
  user_id_type text;
  tenant_id_type text;
  target_tables text[] := array[
    'clients',
    'estimates',
    'estimate_builder',
    'jobs',
    'invoices',
    'payments',
    'quotes',
    'contracts',
    'estimate_requests',
    'services_catalog',
    'email_campaigns',
    'email_logs',
    'email_inbound'
  ];
begin
  foreach tbl in array target_tables loop
    if not exists (
      select 1
      from information_schema.tables
      where table_schema = 'public'
        and table_name = tbl
    ) then
      continue;
    end if;

    select c.udt_name
    into user_id_type
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = tbl
      and c.column_name = 'user_id'
    limit 1;

    has_user_id := user_id_type in ('uuid', 'text', 'varchar', 'bpchar');

    select c.udt_name
    into tenant_id_type
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = tbl
      and c.column_name = 'tenant_id'
    limit 1;

    has_tenant_id := tenant_id_type in ('uuid', 'text', 'varchar', 'bpchar');

    if not has_user_id then
      continue;
    end if;

    execute format('alter table public.%I enable row level security', tbl);
    execute format('alter table public.%I force row level security', tbl);

    -- Phase 1: owner-only restrictive guards.
    execute format('drop policy if exists %I on public.%I', tbl || '_owner_guard_select', tbl);
    execute format(
      'create policy %I on public.%I as restrictive for select to authenticated using (public.is_row_owner(user_id))',
      tbl || '_owner_guard_select',
      tbl
    );

    execute format('drop policy if exists %I on public.%I', tbl || '_owner_guard_insert', tbl);
    execute format(
      'create policy %I on public.%I as restrictive for insert to authenticated with check (public.is_row_owner(user_id))',
      tbl || '_owner_guard_insert',
      tbl
    );

    execute format('drop policy if exists %I on public.%I', tbl || '_owner_guard_update', tbl);
    execute format(
      'create policy %I on public.%I as restrictive for update to authenticated using (public.is_row_owner(user_id)) with check (public.is_row_owner(user_id))',
      tbl || '_owner_guard_update',
      tbl
    );

    execute format('drop policy if exists %I on public.%I', tbl || '_owner_guard_delete', tbl);
    execute format(
      'create policy %I on public.%I as restrictive for delete to authenticated using (public.is_row_owner(user_id))',
      tbl || '_owner_guard_delete',
      tbl
    );

    if not has_tenant_id then
      continue;
    end if;

    -- Phase 2: add tenant membership guards and widen read only for tenant admins.
    execute format('drop policy if exists %I on public.%I', tbl || '_owner_guard_select', tbl);
    execute format('drop policy if exists %I on public.%I', tbl || '_tenant_guard_select', tbl);
    execute format(
      'create policy %I on public.%I as restrictive for select to authenticated using ((public.is_tenant_member(tenant_id) and public.is_row_owner(user_id)) or (public.is_tenant_member(tenant_id) and public.request_user_role() in (''admin'', ''owner'', ''super_admin'')))',
      tbl || '_tenant_guard_select',
      tbl
    );

    execute format('drop policy if exists %I on public.%I', tbl || '_tenant_guard_insert', tbl);
    execute format(
      'create policy %I on public.%I as restrictive for insert to authenticated with check (public.is_tenant_member(tenant_id))',
      tbl || '_tenant_guard_insert',
      tbl
    );

    execute format('drop policy if exists %I on public.%I', tbl || '_tenant_guard_update', tbl);
    execute format(
      'create policy %I on public.%I as restrictive for update to authenticated using (public.is_tenant_member(tenant_id)) with check (public.is_tenant_member(tenant_id))',
      tbl || '_tenant_guard_update',
      tbl
    );

    execute format('drop policy if exists %I on public.%I', tbl || '_tenant_guard_delete', tbl);
    execute format(
      'create policy %I on public.%I as restrictive for delete to authenticated using (public.is_tenant_member(tenant_id))',
      tbl || '_tenant_guard_delete',
      tbl
    );
  end loop;
end $$;

notify pgrst, 'reload schema';

commit;