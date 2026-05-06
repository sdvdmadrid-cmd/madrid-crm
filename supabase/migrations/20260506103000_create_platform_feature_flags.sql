begin;

create table if not exists public.platform_feature_flags (
  key text primary key,
  enabled boolean not null default false,
  description text not null default '',
  updated_by text,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.platform_feature_flags enable row level security;

create policy "service_role_all_platform_feature_flags"
  on public.platform_feature_flags
  for all
  to service_role
  using (true)
  with check (true);

create index if not exists platform_feature_flags_updated_at_idx
  on public.platform_feature_flags (updated_at desc);

commit;
