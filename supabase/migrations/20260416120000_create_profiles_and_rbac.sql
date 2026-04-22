begin;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  tenant_id uuid not null,
  role text not null check (role in ('admin', 'worker'))
);

create index if not exists profiles_tenant_id_idx
  on public.profiles (tenant_id);

insert into public.profiles (id, tenant_id, role)
select
  au.id,
  au.id as tenant_id,
  case
    when lower(coalesce(au.raw_app_meta_data ->> 'role', au.raw_user_meta_data ->> 'role', 'worker')) in ('super_admin', 'owner', 'admin') then 'admin'
    else 'worker'
  end as role
from auth.users au
on conflict (id) do nothing;

create or replace function public.current_profile_tenant_id()
returns uuid
language sql
stable
as $$
  select p.tenant_id
  from public.profiles p
  where p.id = auth.uid()
  limit 1;
$$;

create or replace function public.current_profile_role()
returns text
language sql
stable
as $$
  select coalesce(
    (select p.role from public.profiles p where p.id = auth.uid() limit 1),
    lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', auth.jwt() -> 'user_metadata' ->> 'role', 'worker'))
  );
$$;

create or replace function public.is_admin_profile()
returns boolean
language sql
stable
as $$
  select public.current_profile_role() = 'admin'
    or lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '')) = 'super_admin';
$$;

create or replace function public.can_access_tenant(row_tenant_id uuid)
returns boolean
language sql
stable
as $$
  select auth.uid() is not null
    and (
      lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '')) = 'super_admin'
      or row_tenant_id = public.current_profile_tenant_id()
    );
$$;

alter table public.profiles enable row level security;
alter table public.profiles force row level security;

drop policy if exists profiles_select_self_or_admin on public.profiles;
create policy profiles_select_self_or_admin
  on public.profiles
  for select
  to authenticated
  using (
    id = auth.uid()
    or (
      public.is_admin_profile()
      and tenant_id = public.current_profile_tenant_id()
    )
    or lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '')) = 'super_admin'
  );

drop policy if exists profiles_update_self_or_admin on public.profiles;
create policy profiles_update_self_or_admin
  on public.profiles
  for update
  to authenticated
  using (
    id = auth.uid()
    or public.is_admin_profile()
    or lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '')) = 'super_admin'
  )
  with check (
    (
      id = auth.uid()
      and tenant_id = public.current_profile_tenant_id()
    )
    or public.is_admin_profile()
    or lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '')) = 'super_admin'
  );

drop policy if exists profiles_insert_admin_only on public.profiles;
create policy profiles_insert_admin_only
  on public.profiles
  for insert
  to authenticated
  with check (
    public.is_admin_profile()
    or lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '')) = 'super_admin'
  );

do $$
declare
  tbl text;
  pol record;
  has_uuid_tenant_id boolean;
  operational_tables text[] := array[
    'appointments',
    'jobs',
    'clients',
    'estimates',
    'estimate_builder',
    'quotes',
    'contracts',
    'estimate_requests',
    'notifications'
  ];
  sensitive_tables text[] := array[
    'invoices',
    'company_profiles',
    'services_catalog',
    'email_campaigns',
    'email_logs'
  ];
begin
  foreach tbl in array operational_tables loop
    if exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = tbl
    ) then
      select exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = tbl
          and column_name = 'tenant_id'
          and udt_name = 'uuid'
      ) into has_uuid_tenant_id;

      if not has_uuid_tenant_id then
        continue;
      end if;

      execute format('alter table public.%I enable row level security', tbl);
      execute format('alter table public.%I force row level security', tbl);

      for pol in
        select policyname from pg_policies
        where schemaname = 'public' and tablename = tbl
      loop
        execute format('drop policy if exists %I on public.%I', pol.policyname, tbl);
      end loop;

      execute format(
        'create policy %I on public.%I for select to authenticated using (public.can_access_tenant(tenant_id))',
        tbl || '_rbac_select',
        tbl
      );

      execute format(
        'create policy %I on public.%I for insert to authenticated with check (public.can_access_tenant(tenant_id))',
        tbl || '_rbac_insert',
        tbl
      );

      execute format(
        'create policy %I on public.%I for update to authenticated using (public.can_access_tenant(tenant_id)) with check (public.can_access_tenant(tenant_id))',
        tbl || '_rbac_update',
        tbl
      );

      execute format(
        'create policy %I on public.%I for delete to authenticated using (public.can_access_tenant(tenant_id) and public.is_admin_profile())',
        tbl || '_rbac_delete_admin',
        tbl
      );
    end if;
  end loop;

  foreach tbl in array sensitive_tables loop
    if exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = tbl
    ) then
      select exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = tbl
          and column_name = 'tenant_id'
          and udt_name = 'uuid'
      ) into has_uuid_tenant_id;

      if not has_uuid_tenant_id then
        continue;
      end if;

      execute format('alter table public.%I enable row level security', tbl);
      execute format('alter table public.%I force row level security', tbl);

      for pol in
        select policyname from pg_policies
        where schemaname = 'public' and tablename = tbl
      loop
        execute format('drop policy if exists %I on public.%I', pol.policyname, tbl);
      end loop;

      execute format(
        'create policy %I on public.%I for select to authenticated using (public.can_access_tenant(tenant_id))',
        tbl || '_rbac_select',
        tbl
      );

      execute format(
        'create policy %I on public.%I for insert to authenticated with check (public.can_access_tenant(tenant_id) and public.is_admin_profile())',
        tbl || '_rbac_insert_admin',
        tbl
      );

      execute format(
        'create policy %I on public.%I for update to authenticated using (public.can_access_tenant(tenant_id) and public.is_admin_profile()) with check (public.can_access_tenant(tenant_id) and public.is_admin_profile())',
        tbl || '_rbac_update_admin',
        tbl
      );

      execute format(
        'create policy %I on public.%I for delete to authenticated using (public.can_access_tenant(tenant_id) and public.is_admin_profile())',
        tbl || '_rbac_delete_admin',
        tbl
      );
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';

commit;