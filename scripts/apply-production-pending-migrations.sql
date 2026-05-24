-- Supabase Dashboard → SQL Editor → New query → Run
-- Applies PR #28 pending migrations (copy full contents of each file in order).

-- Step A: supabase/migrations/20260525120000_website_leads_production_fields.sql
-- Step B: supabase/migrations/20260526140000_contractor_reputation.sql

-- After running, verify:
--   select column_name from information_schema.columns
--   where table_name = 'contractor_website_leads' and column_name in ('budget_range','submission_id');
--   select to_regclass('public.contractor_reviews');
