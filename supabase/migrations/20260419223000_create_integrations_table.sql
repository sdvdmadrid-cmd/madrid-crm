begin;

create extension if not exists "pgcrypto";

create table if not exists public.integrations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  access_token text not null default '',
  refresh_token text,
  expires_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint integrations_user_provider_key unique (user_id, provider)
);

create index if not exists integrations_tenant_provider_idx
  on public.integrations (tenant_id, provider);

create index if not exists integrations_user_provider_idx
  on public.integrations (user_id, provider);

alter table public.integrations enable row level security;
alter table public.integrations force row level security;

drop policy if exists integrations_select_own on public.integrations;
create policy integrations_select_own
  on public.integrations
  for select
  to authenticated
  using (
    public.is_row_owner(user_id)
    and public.can_access_tenant(tenant_id)
  );

drop policy if exists integrations_insert_own on public.integrations;
create policy integrations_insert_own
  on public.integrations
  for insert
  to authenticated
  with check (
    public.is_row_owner(user_id)
    and public.can_access_tenant(tenant_id)
  );

drop policy if exists integrations_update_own on public.integrations;
create policy integrations_update_own
  on public.integrations
  for update
  to authenticated
  using (
    public.is_row_owner(user_id)
    and public.can_access_tenant(tenant_id)
  )
  with check (
    public.is_row_owner(user_id)
    and public.can_access_tenant(tenant_id)
  );

drop policy if exists integrations_delete_own on public.integrations;
create policy integrations_delete_own
  on public.integrations
  for delete
  to authenticated
  using (
    public.is_row_owner(user_id)
    and public.can_access_tenant(tenant_id)
  );

notify pgrst, 'reload schema';

commit;