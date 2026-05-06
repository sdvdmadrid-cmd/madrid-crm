create table if not exists public.auth_rate_limits (
  key text primary key,
  count integer not null default 0,
  first_attempt_at timestamptz not null,
  blocked_until timestamptz,
  expires_at timestamptz,
  updated_at timestamptz not null default timezone('utc', now())
);

-- RLS enabled: this table is server-only (service_role bypasses RLS).
-- No policies are defined, so anon and authenticated users have zero access.
alter table public.auth_rate_limits enable row level security;

create index if not exists auth_rate_limits_blocked_until_idx
  on public.auth_rate_limits (blocked_until);

create index if not exists auth_rate_limits_expires_at_idx
  on public.auth_rate_limits (expires_at);
