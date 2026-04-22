begin;

create extension if not exists "pgcrypto";

create or replace function public.try_parse_uuid(value text)
returns uuid
language plpgsql
immutable
as $$
begin
  if value is null or btrim(value) = '' then
    return null;
  end if;

  return value::uuid;
exception
  when others then
    return null;
end;
$$;

create or replace function public.is_current_tenant(row_tenant_id uuid)
returns boolean
language sql
stable
as $$
  select auth.uid() is not null and row_tenant_id = auth.uid();
$$;

do $$
declare
  tbl text;
  pol record;
  has_tenant_id boolean;
  has_user_id boolean;
  target_tables text[] := array[
    'appointments',
    'jobs',
    'clients',
    'estimates',
    'estimate_builder',
    'invoices'
  ];
begin
  foreach tbl in array target_tables loop
    if exists (
      select 1
      from information_schema.tables
      where table_schema = 'public'
        and table_name = tbl
    ) then
      select exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = tbl
          and column_name = 'tenant_id'
      ) into has_tenant_id;

      select exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = tbl
          and column_name = 'user_id'
      ) into has_user_id;

      if not has_tenant_id then
        execute format('alter table public.%I add column tenant_id uuid', tbl);
        has_tenant_id := true;
      end if;

      if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = tbl
          and column_name = 'tenant_id'
          and udt_name <> 'uuid'
      ) then
        execute format('alter table public.%I alter column tenant_id drop not null', tbl);

        if has_user_id then
          execute format(
            'alter table public.%I alter column tenant_id type uuid using coalesce(public.try_parse_uuid(tenant_id::text), public.try_parse_uuid(user_id::text))',
            tbl
          );
        else
          execute format(
            'alter table public.%I alter column tenant_id type uuid using public.try_parse_uuid(tenant_id::text)',
            tbl
          );
        end if;
      end if;

      if has_user_id then
        execute format(
          'update public.%I set tenant_id = coalesce(tenant_id, public.try_parse_uuid(user_id::text)) where tenant_id is null',
          tbl
        );
      end if;

      execute format(
        'create index if not exists %I on public.%I (tenant_id)',
        tbl || '_tenant_id_idx',
        tbl
      );

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
        'create policy %I on public.%I for select to authenticated using (public.is_current_tenant(tenant_id))',
        tbl || '_tenant_select',
        tbl
      );

      execute format(
        'create policy %I on public.%I for insert to authenticated with check (public.is_current_tenant(tenant_id))',
        tbl || '_tenant_insert',
        tbl
      );

      execute format(
        'create policy %I on public.%I for update to authenticated using (public.is_current_tenant(tenant_id)) with check (public.is_current_tenant(tenant_id))',
        tbl || '_tenant_update',
        tbl
      );

      execute format(
        'create policy %I on public.%I for delete to authenticated using (public.is_current_tenant(tenant_id))',
        tbl || '_tenant_delete',
        tbl
      );
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';

commit;