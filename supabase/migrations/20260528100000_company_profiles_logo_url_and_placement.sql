-- Issue #40 — logo upload (manual + AI 3D) and placement on docs.
--
-- Today the company logo lives as a heavy base64 data URL in
-- `logo_data_url`. This migration keeps that column for backwards
-- compatibility but adds two new fields the new flow uses:
--   - `logo_url` for an HTTPS URL pointing at a Supabase Storage object
--     (so we don't ship multi-MB payloads in every API response).
--   - `logo_placement` to control where the logo renders on invoices,
--     estimates, and quote pages.

alter table public.company_profiles
  add column if not exists logo_url text default '',
  add column if not exists logo_placement text default 'top-left';

update public.company_profiles
set logo_placement = 'top-left'
where logo_placement is null or logo_placement = '';

-- Constrain to the supported placement values. Using a CHECK because
-- the app surface treats this as a small enum and we want a hard DB
-- guard against unexpected values from API clients.
alter table public.company_profiles
  drop constraint if exists company_profiles_logo_placement_check;
alter table public.company_profiles
  add constraint company_profiles_logo_placement_check
  check (logo_placement in ('top-left', 'top-right', 'centered', 'hidden'));

comment on column public.company_profiles.logo_url is
  'HTTPS URL to the logo asset in Supabase Storage (website-media bucket, logos/{tenant_id}/* path). Preferred over logo_data_url.';
comment on column public.company_profiles.logo_placement is
  'Where the logo renders on invoices/estimates/quotes. One of: top-left (default), top-right, centered, hidden.';
