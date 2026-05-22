-- Production may have an older company_profiles table missing public_display_name.
alter table if exists public.company_profiles
  add column if not exists public_display_name text not null default '';

update public.company_profiles
set public_display_name = coalesce(nullif(public_display_name, ''), company_name, '')
where public_display_name is null or public_display_name = '';
