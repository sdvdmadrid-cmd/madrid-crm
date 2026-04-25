begin;

create extension if not exists "pgcrypto";

create table if not exists public.services_catalog (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  user_id uuid,
  created_by uuid,
  name text not null default '',
  description text not null default '',
  category text not null default '',
  unit text not null default 'service',
  price_min numeric(12,2) not null default 0,
  price_max numeric(12,2) not null default 0,
  materials text not null default '',
  labor_notes text not null default '',
  state text not null default 'ALL',
  pricing_type text not null default 'per_unit',
  material_cost numeric(12,2) not null default 0,
  labor_cost numeric(12,2) not null default 0,
  overhead_percentage numeric(6,2) not null default 10,
  profit_percentage numeric(6,2) not null default 20,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table if exists public.services_catalog
  add column if not exists tenant_id uuid,
  add column if not exists user_id uuid,
  add column if not exists created_by uuid,
  add column if not exists name text not null default '',
  add column if not exists description text not null default '',
  add column if not exists category text not null default '',
  add column if not exists unit text not null default 'service',
  add column if not exists price_min numeric(12,2) not null default 0,
  add column if not exists price_max numeric(12,2) not null default 0,
  add column if not exists materials text not null default '',
  add column if not exists labor_notes text not null default '',
  add column if not exists state text not null default 'ALL',
  add column if not exists pricing_type text not null default 'per_unit',
  add column if not exists material_cost numeric(12,2) not null default 0,
  add column if not exists labor_cost numeric(12,2) not null default 0,
  add column if not exists overhead_percentage numeric(6,2) not null default 10,
  add column if not exists profit_percentage numeric(6,2) not null default 20,
  add column if not exists created_at timestamptz not null default timezone('utc', now()),
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'services_catalog_name_not_blank'
      and conrelid = 'public.services_catalog'::regclass
  ) then
    alter table public.services_catalog
      add constraint services_catalog_name_not_blank
      check (btrim(name) <> '');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'services_catalog_category_not_blank'
      and conrelid = 'public.services_catalog'::regclass
  ) then
    alter table public.services_catalog
      add constraint services_catalog_category_not_blank
      check (btrim(category) <> '');
  end if;
end $$;

create index if not exists services_catalog_tenant_category_name_idx
  on public.services_catalog (tenant_id, category, name);

create index if not exists services_catalog_tenant_user_idx
  on public.services_catalog (tenant_id, user_id);

alter table public.services_catalog enable row level security;
alter table public.services_catalog force row level security;

drop policy if exists services_catalog_select on public.services_catalog;
drop policy if exists services_catalog_insert on public.services_catalog;
drop policy if exists services_catalog_update on public.services_catalog;
drop policy if exists services_catalog_delete_admin on public.services_catalog;

create policy services_catalog_select
  on public.services_catalog
  for select
  to authenticated
  using (public.can_access_tenant(tenant_id));

create policy services_catalog_insert
  on public.services_catalog
  for insert
  to authenticated
  with check (public.can_access_tenant(tenant_id));

create policy services_catalog_update
  on public.services_catalog
  for update
  to authenticated
  using (public.can_access_tenant(tenant_id))
  with check (public.can_access_tenant(tenant_id));

create policy services_catalog_delete_admin
  on public.services_catalog
  for delete
  to authenticated
  using (public.can_access_tenant(tenant_id) and public.is_admin_profile());

notify pgrst, 'reload schema';

commit;
