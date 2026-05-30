-- Align estimate_revisions.estimate_id with production estimates.id (bigint).
-- The original migration assumed uuid; live DB uses integer/bigint estimate ids.

truncate table public.estimate_revisions;

drop index if exists public.estimate_revisions_estimate_idx;

alter table public.estimate_revisions
  drop column estimate_id;

alter table public.estimate_revisions
  add column estimate_id bigint not null;

create index if not exists estimate_revisions_estimate_idx
  on public.estimate_revisions (estimate_id, created_at desc);
