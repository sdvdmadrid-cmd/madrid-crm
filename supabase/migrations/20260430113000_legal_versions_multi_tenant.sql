begin;

-- Multi-tenant legal versions: scope all versions by tenant
alter table public.legal_versions
  add column if not exists tenant_id text;

-- Backfill existing rows to a deterministic tenant bucket.
update public.legal_versions
set tenant_id = coalesce(nullif(tenant_id, ''), 'default')
where tenant_id is null or tenant_id = '';

alter table public.legal_versions
  alter column tenant_id set not null;

-- Replace global uniqueness with per-tenant uniqueness.
alter table public.legal_versions
  drop constraint if exists legal_versions_version_name_key;

create unique index if not exists legal_versions_tenant_version_unique
  on public.legal_versions (tenant_id, version_name);

-- Ensure only one current legal version per tenant.
create unique index if not exists legal_versions_one_current_per_tenant
  on public.legal_versions (tenant_id)
  where is_current = true;

create index if not exists legal_versions_tenant_current_idx
  on public.legal_versions (tenant_id, is_current, created_at desc);

-- Acceptance lookup now always includes tenant.
create index if not exists legal_acceptance_tenant_user_version
  on public.legal_acceptance (tenant_id, user_id, version, accepted_at desc);

commit;
