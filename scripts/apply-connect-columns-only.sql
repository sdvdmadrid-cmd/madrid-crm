-- Run in Supabase SQL Editor if `npm run db:apply-connect` fails locally.
-- Project: https://supabase.com/dashboard/project/fhcbnupmdpphzdafmmgd/sql/new

alter table if exists public.company_profiles
  add column if not exists stripe_connect_account_id text,
  add column if not exists stripe_connect_charges_enabled boolean not null default false,
  add column if not exists stripe_connect_payouts_enabled boolean not null default false,
  add column if not exists stripe_connect_onboarded_at timestamptz;

create unique index if not exists company_profiles_stripe_connect_account_id_unique_idx
  on public.company_profiles (stripe_connect_account_id)
  where stripe_connect_account_id is not null and stripe_connect_account_id <> '';

notify pgrst, 'reload schema';
