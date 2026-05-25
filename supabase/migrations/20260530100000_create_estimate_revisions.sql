-- Paquete J: revision history for estimates.
--
-- The audit-blob inside estimates.notes captures the last status change but
-- not the *history* of changes (totals, services, statuses) across multiple
-- edits. This migration introduces a dedicated append-only table that the
-- PATCH /api/estimates/:id route writes to so the detail panel can render a
-- proper timeline (when, who, what changed).
--
-- The table is intentionally append-only and decoupled from the main
-- estimates row (no FK cascade, no triggers). Failure to write a revision
-- never blocks the underlying estimate update — the route logs and moves on.

create table if not exists public.estimate_revisions (
  id uuid primary key default gen_random_uuid(),
  estimate_id uuid not null,
  tenant_id uuid,
  user_id uuid,
  actor_label text not null default '',
  kind text not null default 'updated',
  status_before text not null default '',
  status_after text not null default '',
  total_before numeric(14, 2) not null default 0,
  total_after numeric(14, 2) not null default 0,
  changes jsonb not null default '{}'::jsonb,
  note text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists estimate_revisions_estimate_idx
  on public.estimate_revisions (estimate_id, created_at desc);

create index if not exists estimate_revisions_tenant_idx
  on public.estimate_revisions (tenant_id, created_at desc);

-- RLS is enabled but no policy is created, which keeps the table fully
-- locked down at the database edge. All access flows through the service
-- role (supabaseAdmin) in the API layer, where tenant scoping is enforced
-- explicitly. This mirrors how other audit-style tables are protected.
alter table public.estimate_revisions enable row level security;
