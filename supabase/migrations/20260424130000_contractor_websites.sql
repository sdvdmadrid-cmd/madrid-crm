-- Contractor website builder: stores the generated and customized contractor
-- public website content. One row per tenant.

create table if not exists public.contractor_websites (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  slug           text not null,
  headline       text not null default '',
  subheadline    text not null default '',
  about_text     text not null default '',
  cta_text       text not null default '',
  theme_color    text not null default '#16a34a',
  services       jsonb not null default '[]'::jsonb,
  published      boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Each tenant has one website; slug is globally unique for public routing
create unique index if not exists contractor_websites_tenant_idx
  on public.contractor_websites (tenant_id);

create unique index if not exists contractor_websites_slug_idx
  on public.contractor_websites (slug);

-- Row Level Security
alter table public.contractor_websites enable row level security;

create policy "Tenant can manage their own website"
  on public.contractor_websites
  for all
  using (
    tenant_id in (
      select id from public.tenants where id = (
        select tenant_id from public.users where id = auth.uid() limit 1
      )
    )
  );

-- Public read for published sites (supports /site/[slug] route)
create policy "Public can read published websites"
  on public.contractor_websites
  for select
  using (published = true);
