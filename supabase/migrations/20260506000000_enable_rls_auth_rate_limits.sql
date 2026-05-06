-- Fix: enable RLS on auth_rate_limits.
-- This table is written/read exclusively by the server via service_role key.
-- service_role bypasses RLS automatically, so no policies are needed.
-- anon and authenticated users get zero access.
alter table public.auth_rate_limits enable row level security;
