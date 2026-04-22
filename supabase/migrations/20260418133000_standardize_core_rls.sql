-- Standardize core CRUD RLS for clients, jobs, and invoices.
-- Model:
-- - SELECT: owner OR tenant member
-- - INSERT/UPDATE: owner OR tenant member
-- - DELETE: owner OR tenant admin

begin;

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

create or replace function public.is_tenant_admin()
returns boolean
language sql
stable
as $$
  select auth.uid() is not null
    and public.request_user_role() in ('admin', 'owner', 'super_admin');
$$;

do $$
declare
  tbl text;
  pol record;
  user_id_type text;
  tenant_id_type text;
  target_tables text[] := array['clients', 'jobs', 'invoices'];
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

    if user_id_type not in ('uuid', 'text', 'varchar', 'bpchar') then
      continue;
    end if;

    select c.udt_name
    into tenant_id_type
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = tbl
      and c.column_name = 'tenant_id'
    limit 1;

    if tenant_id_type not in ('uuid', 'text', 'varchar', 'bpchar') then
      continue;
    end if;

    execute format('alter table public.%I enable row level security', tbl);
    execute format('alter table public.%I force row level security', tbl);

    for pol in
      select policyname
      from pg_policies
      where schemaname = 'public'
        and tablename = tbl
    loop
      execute format('drop policy if exists %I on public.%I', pol.policyname, tbl);
    end loop;

    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_row_owner(user_id) or public.is_tenant_member(tenant_id))',
      tbl || '_core_select',
      tbl
    );

    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.is_row_owner(user_id) or public.is_tenant_member(tenant_id))',
      tbl || '_core_insert',
      tbl
    );

    execute format(
      'create policy %I on public.%I for update to authenticated using (public.is_row_owner(user_id) or public.is_tenant_member(tenant_id)) with check (public.is_row_owner(user_id) or public.is_tenant_member(tenant_id))',
      tbl || '_core_update',
      tbl
    );

    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.is_row_owner(user_id) or (public.is_tenant_member(tenant_id) and public.is_tenant_admin()))',
      tbl || '_core_delete',
      tbl
    );
  end loop;
end $$;

notify pgrst, 'reload schema';

commit;