-- Connected review sources (Google Place ID, Yelp business ID, sync metadata)

create table if not exists public.contractor_review_sources (
  tenant_id uuid primary key,
  google_place_id text,
  google_profile_url text,
  yelp_business_id text,
  yelp_profile_url text,
  last_sync_at timestamptz,
  last_sync_status jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists contractor_review_sources_sync_idx
  on public.contractor_review_sources (last_sync_at desc nulls last);

alter table public.contractor_review_sources enable row level security;

create policy "Tenant reads own review sources"
  on public.contractor_review_sources for select to authenticated
  using (public.can_access_tenant(tenant_id));

create policy "Tenant writes own review sources"
  on public.contractor_review_sources for all to authenticated
  using (public.can_access_tenant(tenant_id))
  with check (public.can_access_tenant(tenant_id));
