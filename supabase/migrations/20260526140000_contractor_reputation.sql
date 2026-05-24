-- Reviews & reputation (private data; public display is opt-in per review)

create table if not exists public.contractor_reviews (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  platform text not null default 'manual'
    check (platform in (
      'manual', 'google', 'yelp', 'facebook', 'instagram', 'tiktok',
      'houzz', 'angi', 'thumbtack', 'other'
    )),
  source_url text,
  author_name text not null default 'Customer',
  rating numeric(3,1) check (rating is null or (rating >= 0 and rating <= 5)),
  review_text text not null,
  review_date timestamptz,
  photo_url text,
  video_url text,
  service_type text,
  verified boolean not null default false,
  pinned boolean not null default false,
  hidden boolean not null default false,
  show_on_website boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists contractor_reviews_tenant_idx
  on public.contractor_reviews (tenant_id, created_at desc);

create index if not exists contractor_reviews_public_idx
  on public.contractor_reviews (tenant_id, show_on_website, hidden, pinned desc, review_date desc);

create table if not exists public.contractor_social_profiles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  platform text not null
    check (platform in (
      'facebook', 'instagram', 'tiktok', 'youtube', 'yelp', 'google',
      'houzz', 'angi', 'thumbtack', 'linkedin', 'other'
    )),
  profile_url text not null default '',
  display_on_website boolean not null default true,
  show_latest_content boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, platform)
);

create index if not exists contractor_social_profiles_tenant_idx
  on public.contractor_social_profiles (tenant_id);

alter table public.contractor_reviews enable row level security;
alter table public.contractor_social_profiles enable row level security;

create policy "Tenant reads own reviews"
  on public.contractor_reviews for select to authenticated
  using (public.can_access_tenant(tenant_id));

create policy "Tenant writes own reviews"
  on public.contractor_reviews for all to authenticated
  using (public.can_access_tenant(tenant_id))
  with check (public.can_access_tenant(tenant_id));

create policy "Tenant reads own social profiles"
  on public.contractor_social_profiles for select to authenticated
  using (public.can_access_tenant(tenant_id));

create policy "Tenant writes own social profiles"
  on public.contractor_social_profiles for all to authenticated
  using (public.can_access_tenant(tenant_id))
  with check (public.can_access_tenant(tenant_id));
