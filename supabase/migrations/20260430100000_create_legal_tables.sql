begin;

-- legal_versions: tracks published legal document versions
create table if not exists public.legal_versions (
  id uuid primary key default gen_random_uuid(),
  version_name text not null unique,
  content_snapshot text not null default '',
  is_current boolean not null default false,
  created_at timestamptz not null default timezone('utc', now())
);

-- legal_acceptance: records each user's acceptance of a legal version
create table if not exists public.legal_acceptance (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  tenant_id text not null default '',
  version text not null,
  accepted boolean not null default true,
  accepted_at timestamptz not null default timezone('utc', now()),
  ip_address text not null default '',
  user_agent text not null default ''
);

create index if not exists legal_acceptance_user_version
  on public.legal_acceptance (user_id, version);

create index if not exists legal_acceptance_user_latest
  on public.legal_acceptance (user_id, accepted_at desc);

-- audit_logs: general purpose compliance audit trail
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  tenant_id text not null default '',
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists audit_logs_user_action
  on public.audit_logs (user_id, action, created_at desc);

create index if not exists audit_logs_tenant_action
  on public.audit_logs (tenant_id, action, created_at desc);

-- Seed the initial legal version.
-- This is conditional so it works for both schemas:
-- 1) original legal_versions (no tenant_id)
-- 2) upgraded legal_versions (tenant_id required)
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'legal_versions'
      and column_name = 'tenant_id'
  ) then
    insert into public.legal_versions (
      tenant_id,
      version_name,
      content_snapshot,
      is_current
    )
    select
      'default',
      'v1.0-April-2026',
      'ContractorFlow Legal & Compliance Terms v1.0 — April 30, 2026. Full content available at /legal.',
      true
    where not exists (
      select 1
      from public.legal_versions
      where version_name = 'v1.0-April-2026'
        and coalesce(tenant_id, 'default') = 'default'
    );
  else
    insert into public.legal_versions (version_name, content_snapshot, is_current)
    select
      'v1.0-April-2026',
      'ContractorFlow Legal & Compliance Terms v1.0 — April 30, 2026. Full content available at /legal.',
      true
    where not exists (
      select 1
      from public.legal_versions
      where version_name = 'v1.0-April-2026'
    );
  end if;
end
$$;

-- Row level security: service role has full access, no direct client access
alter table public.legal_acceptance enable row level security;
alter table public.legal_versions enable row level security;
alter table public.audit_logs enable row level security;

create policy "service_role_all_legal_acceptance"
  on public.legal_acceptance for all to service_role
  using (true) with check (true);

create policy "service_role_all_legal_versions"
  on public.legal_versions for all to service_role
  using (true) with check (true);

create policy "service_role_all_audit_logs"
  on public.audit_logs for all to service_role
  using (true) with check (true);

commit;
