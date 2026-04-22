-- Strict RLS: every user-owned row must match auth.uid() exactly.
-- This migration removes existing public table policies and recreates strict ones
-- for all known user-owned tables that include a user_id column.

begin;

create or replace function public.is_row_owner(row_user_id uuid)
returns boolean
language sql
stable
as $$
  select auth.uid() is not null and row_user_id = auth.uid();
$$;

do $$
declare
  tbl text;
  pol record;
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
    'services_catalog'
  ];
begin
  foreach tbl in array target_tables loop
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = tbl
        and column_name = 'user_id'
    ) then
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
        'create policy %I on public.%I for select to authenticated using (public.is_row_owner(user_id))',
        tbl || '_select_own_strict',
        tbl
      );

      execute format(
        'create policy %I on public.%I for insert to authenticated with check (public.is_row_owner(user_id))',
        tbl || '_insert_own_strict',
        tbl
      );

      execute format(
        'create policy %I on public.%I for update to authenticated using (public.is_row_owner(user_id)) with check (public.is_row_owner(user_id))',
        tbl || '_update_own_strict',
        tbl
      );

      execute format(
        'create policy %I on public.%I for delete to authenticated using (public.is_row_owner(user_id))',
        tbl || '_delete_own_strict',
        tbl
      );
    end if;
  end loop;
end $$;

commit;
