-- Link contracts generated from estimates back to source estimate (contractor navigation).

alter table public.contracts
  add column if not exists estimate_id text not null default '';

create index if not exists contracts_tenant_estimate_idx
  on public.contracts (tenant_id, estimate_id)
  where estimate_id <> '';
