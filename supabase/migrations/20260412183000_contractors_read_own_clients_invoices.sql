-- Temporary RLS simplification for clients and invoices.
-- Keep local resets/startup stable by avoiding role/tenant helper dependencies.
-- Secure tenant-aware policies can be reintroduced in a later migration.

begin;

drop function if exists public.can_read_row_for_role(uuid, text);
drop function if exists public.request_user_role();

-- CLIENTS: replace SELECT policy with basic owner-only access.

do $$
begin
  if exists (
    select 1
    from information_schema.tables t
    join information_schema.columns c
      on c.table_schema = t.table_schema
     and c.table_name = t.table_name
    where t.table_schema = 'public'
      and t.table_name = 'clients'
      and c.column_name = 'user_id'
  ) then
    drop policy if exists clients_select_owner_tenant_strict on public.clients;
    drop policy if exists clients_select_owner_strict on public.clients;
    drop policy if exists clients_select_read_scope on public.clients;
    execute '
      create policy clients_select_read_scope
      on public.clients
      for select
      to authenticated
      using (public.is_row_owner(user_id))
    ';
  end if;
end $$;

-- INVOICES: replace SELECT policy with basic owner-only access.

do $$
begin
  if exists (
    select 1
    from information_schema.tables t
    join information_schema.columns c
      on c.table_schema = t.table_schema
     and c.table_name = t.table_name
    where t.table_schema = 'public'
      and t.table_name = 'invoices'
      and c.column_name = 'user_id'
  ) then
    drop policy if exists invoices_select_owner_tenant_strict on public.invoices;
    drop policy if exists invoices_select_owner_strict on public.invoices;
    drop policy if exists invoices_select_read_scope on public.invoices;
    execute '
      create policy invoices_select_read_scope
      on public.invoices
      for select
      to authenticated
      using (public.is_row_owner(user_id))
    ';
  end if;
end $$;

commit;
