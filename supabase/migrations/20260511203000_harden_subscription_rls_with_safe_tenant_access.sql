begin;

-- Safe tenant access helper for subscription policies.
-- Uses can_access_tenant(uuid) when available; otherwise falls back to profiles-based tenant membership.
create or replace function public.safe_can_access_tenant(row_tenant_id uuid)
returns boolean
language plpgsql
stable
as $$
declare
  result boolean;
begin
  if auth.uid() is null or row_tenant_id is null then
    return false;
  end if;

  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'can_access_tenant'
      and p.pronargs = 1
  ) then
    execute 'select public.can_access_tenant($1)'
      into result
      using row_tenant_id;
    return coalesce(result, false);
  end if;

  return exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.tenant_id = row_tenant_id
  );
end;
$$;

grant execute on function public.safe_can_access_tenant(uuid) to authenticated;

-- Re-apply subscription policies using safe helper.
drop policy if exists "subscriptions_read_own" on public.contractor_subscriptions;
create policy "subscriptions_read_own" on public.contractor_subscriptions
  for select
  using (public.safe_can_access_tenant(tenant_id));

drop policy if exists "subscriptions_create_own" on public.contractor_subscriptions;
create policy "subscriptions_create_own" on public.contractor_subscriptions
  for insert
  with check (public.safe_can_access_tenant(tenant_id));

drop policy if exists "subscriptions_update_own" on public.contractor_subscriptions;
create policy "subscriptions_update_own" on public.contractor_subscriptions
  for update
  using (public.safe_can_access_tenant(tenant_id))
  with check (public.safe_can_access_tenant(tenant_id));

drop policy if exists "invoices_read_own" on public.subscription_invoices;
create policy "invoices_read_own" on public.subscription_invoices
  for select
  using (public.safe_can_access_tenant(tenant_id));

drop policy if exists "invoices_create_own" on public.subscription_invoices;
create policy "invoices_create_own" on public.subscription_invoices
  for insert
  with check (public.safe_can_access_tenant(tenant_id));

drop policy if exists "invoices_update_own" on public.subscription_invoices;
create policy "invoices_update_own" on public.subscription_invoices
  for update
  using (public.safe_can_access_tenant(tenant_id))
  with check (public.safe_can_access_tenant(tenant_id));

commit;
