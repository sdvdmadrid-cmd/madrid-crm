-- Close RLS gaps flagged by Supabase security advisor (May/June 2026).
--
-- Context:
--   Most API routes use supabaseAdmin (service role), which bypasses RLS.
--   RLS still matters: anyone with the anon/publishable key can call
--   PostgREST directly. Tables without RLS are fully readable/writable.
--
-- This migration is intentionally conservative:
--   * Does NOT drop or replace existing policies on hardened tables.
--   * Enables RLS + FORCE on tables that were never protected.
--   * Adds tenant-scoped policies only where zero policies exist.
--   * Locks down legacy/orphan tables to service-role-only (RLS on, no grants).
--
-- Tables with TEXT tenant_id (company_profiles, email_*) were skipped by
-- older migrations that required tenant_id uuid — those are fixed here.

begin;

-- ---------------------------------------------------------------------------
-- 1. company_profiles — TEXT primary key tenant_id (skipped by uuid-only RBAC)
--    Exposure: logos, addresses, signature thresholds, Stripe Connect ids.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'company_profiles'
  ) then
    alter table public.company_profiles enable row level security;
    alter table public.company_profiles force row level security;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'company_profiles'
    ) then
      create policy company_profiles_tenant_select
        on public.company_profiles
        for select
        to authenticated
        using (
          public.is_tenant_member(tenant_id)
          or lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '')) = 'super_admin'
        );

      create policy company_profiles_tenant_insert
        on public.company_profiles
        for insert
        to authenticated
        with check (
          public.is_tenant_member(tenant_id)
          or lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '')) = 'super_admin'
        );

      create policy company_profiles_tenant_update
        on public.company_profiles
        for update
        to authenticated
        using (
          public.is_tenant_member(tenant_id)
          or lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '')) = 'super_admin'
        )
        with check (
          public.is_tenant_member(tenant_id)
          or lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '')) = 'super_admin'
        );

      create policy company_profiles_tenant_delete
        on public.company_profiles
        for delete
        to authenticated
        using (
          (public.is_tenant_member(tenant_id) and public.is_admin_profile())
          or lower(coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '')) = 'super_admin'
        );
    end if;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. contractor_website_domains — created without RLS (custom hostname map)
--    All production access is via supabaseAdmin; block direct PostgREST access.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'contractor_website_domains'
  ) then
    alter table public.contractor_website_domains enable row level security;
    alter table public.contractor_website_domains force row level security;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'contractor_website_domains'
    ) then
      create policy contractor_website_domains_tenant_select
        on public.contractor_website_domains
        for select
        to authenticated
        using (public.is_tenant_member(tenant_id));

      create policy contractor_website_domains_tenant_insert
        on public.contractor_website_domains
        for insert
        to authenticated
        with check (public.is_tenant_member(tenant_id));

      create policy contractor_website_domains_tenant_update
        on public.contractor_website_domains
        for update
        to authenticated
        using (public.is_tenant_member(tenant_id))
        with check (public.is_tenant_member(tenant_id));

      create policy contractor_website_domains_tenant_delete
        on public.contractor_website_domains
        for delete
        to authenticated
        using (
          public.is_tenant_member(tenant_id)
          and public.is_admin_profile()
        );
    end if;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Legacy bill-payment tables (superseded by bill_payment_* tables).
--    Enable RLS with no permissive policies → service role only.
-- ---------------------------------------------------------------------------
do $$
declare
  legacy_tbl text;
begin
  foreach legacy_tbl in array array['payment_methods', 'autopay_schedules'] loop
    if exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = legacy_tbl
    ) then
      execute format('alter table public.%I enable row level security', legacy_tbl);
      execute format('alter table public.%I force row level security', legacy_tbl);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Safety net: enable RLS on workflow-critical tables if still disabled.
--    Add baseline tenant+owner policies ONLY when the table has zero policies
--    (does not touch tables that already have policy sets from prior migrations).
-- ---------------------------------------------------------------------------
do $$
declare
  tbl text;
  pol_count int;
  has_user_id boolean;
  has_tenant_id boolean;
  tenant_id_type text;
  critical_tables text[] := array[
    'estimates',
    'estimate_builder',
    'estimate_revisions',
    'quotes',
    'contracts',
    'invoices',
    'clients',
    'jobs',
    'payments',
    'email_campaigns',
    'email_logs',
    'email_inbound'
  ];
begin
  foreach tbl in array critical_tables loop
    if not exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = tbl
    ) then
      continue;
    end if;

    execute format('alter table public.%I enable row level security', tbl);
    execute format('alter table public.%I force row level security', tbl);

    select count(*)::int into pol_count
    from pg_policies
    where schemaname = 'public' and tablename = tbl;

    if pol_count > 0 then
      continue;
    end if;

    -- estimate_revisions: intentionally service-role-only (append-only audit).
    if tbl = 'estimate_revisions' then
      continue;
    end if;

    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = tbl and column_name = 'user_id'
    ) into has_user_id;

    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = tbl and column_name = 'tenant_id'
    ) into has_tenant_id;

    if not has_tenant_id then
      continue;
    end if;

    select c.udt_name into tenant_id_type
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = tbl
      and c.column_name = 'tenant_id'
    limit 1;

    if tenant_id_type = 'uuid' and has_user_id then
      execute format(
        'create policy %I on public.%I for select to authenticated using (public.is_tenant_member(tenant_id) and (public.is_row_owner(user_id) or public.request_user_role() in (''admin'', ''owner'', ''super_admin'')))',
        tbl || '_rls_gap_select',
        tbl
      );
      execute format(
        'create policy %I on public.%I for insert to authenticated with check (public.is_tenant_member(tenant_id))',
        tbl || '_rls_gap_insert',
        tbl
      );
      execute format(
        'create policy %I on public.%I for update to authenticated using (public.is_tenant_member(tenant_id)) with check (public.is_tenant_member(tenant_id))',
        tbl || '_rls_gap_update',
        tbl
      );
      execute format(
        'create policy %I on public.%I for delete to authenticated using (public.is_tenant_member(tenant_id) and public.is_admin_profile())',
        tbl || '_rls_gap_delete',
        tbl
      );
    elsif tenant_id_type in ('text', 'varchar', 'bpchar') then
      execute format(
        'create policy %I on public.%I for select to authenticated using (public.is_tenant_member(tenant_id))',
        tbl || '_rls_gap_select',
        tbl
      );
      execute format(
        'create policy %I on public.%I for insert to authenticated with check (public.is_tenant_member(tenant_id))',
        tbl || '_rls_gap_insert',
        tbl
      );
      execute format(
        'create policy %I on public.%I for update to authenticated using (public.is_tenant_member(tenant_id)) with check (public.is_tenant_member(tenant_id))',
        tbl || '_rls_gap_update',
        tbl
      );
      execute format(
        'create policy %I on public.%I for delete to authenticated using (public.is_tenant_member(tenant_id) and public.is_admin_profile())',
        tbl || '_rls_gap_delete',
        tbl
      );
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';

commit;
