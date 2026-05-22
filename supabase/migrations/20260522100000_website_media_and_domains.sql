-- Website media bucket (create in Supabase dashboard if not exists)
-- Storage policy: public read for website-media bucket recommended.

alter table public.contractor_websites
  add column if not exists site_meta jsonb not null default '{}'::jsonb;

create table if not exists public.contractor_website_domains (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  website_id uuid references public.contractor_websites(id) on delete cascade,
  slug text not null,
  hostname text not null,
  verification_token text not null default '',
  verified_at timestamptz,
  ssl_status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contractor_website_domains_hostname_key unique (hostname)
);

create index if not exists contractor_website_domains_slug_idx
  on public.contractor_website_domains (slug);

create index if not exists contractor_website_domains_tenant_idx
  on public.contractor_website_domains (tenant_id);
