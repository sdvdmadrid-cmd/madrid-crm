begin;

alter table if exists public.company_profiles
  add column if not exists service_catalog_preferences jsonb not null default '{}'::jsonb;

update public.company_profiles
set service_catalog_preferences = coalesce(service_catalog_preferences, '{}'::jsonb)
where service_catalog_preferences is null;

commit;