-- Contractor website contact form leads / quote requests
-- Stores quote requests submitted through the public website

create table if not exists public.contractor_website_leads (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null,
  slug           text not null,
  name           text not null,
  email          text not null,
  phone          text,
  description    text not null,
  status         text not null default 'new' check (status in ('new', 'contacted', 'converted', 'archived')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Index for fast lookup by tenant
create index if not exists contractor_website_leads_tenant_idx
  on public.contractor_website_leads (tenant_id);

-- Index for filtering by status
create index if not exists contractor_website_leads_status_idx
  on public.contractor_website_leads (tenant_id, status);

-- Row Level Security
alter table public.contractor_website_leads enable row level security;

create policy "Tenant can view their own leads"
  on public.contractor_website_leads
  for select
  to authenticated
  using (public.can_access_tenant(tenant_id));

create policy "Tenant can update their own leads"
  on public.contractor_website_leads
  for update
  to authenticated
  using (public.can_access_tenant(tenant_id))
  with check (public.can_access_tenant(tenant_id));

-- Allow public insert for quote requests (anonymous users can submit)
create policy "Public can insert leads"
  on public.contractor_website_leads
  for insert
  with check (true);
