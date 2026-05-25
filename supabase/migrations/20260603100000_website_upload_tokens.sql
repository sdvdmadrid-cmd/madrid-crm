-- Mobile/QR photo upload tokens for the contractor website builder.
-- Each row issues a short-lived token (JWT signed off-row, this row is
-- just the audit/revocation record) that lets the holder POST one or more
-- photos straight into the contractor's draft gallery without a Cursor
-- session.
--
-- We intentionally keep the photos themselves OUT of this table — they
-- live in the `website-media` Supabase storage bucket exactly like every
-- other gallery photo. This table only tracks token lifecycle.
create table if not exists public.website_upload_tokens (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  issued_by_user_id uuid,
  jti text not null,
  label text not null default '',
  -- Soft cap on how many photos a single token can land. Keeps a leaked
  -- token from blowing up the contractor's storage quota.
  max_uploads integer not null default 30,
  upload_count integer not null default 0,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_used_at timestamptz,
  last_used_ip text,
  created_at timestamptz not null default now()
);

create unique index if not exists website_upload_tokens_jti_idx
  on public.website_upload_tokens (jti);

create index if not exists website_upload_tokens_tenant_idx
  on public.website_upload_tokens (tenant_id, created_at desc);

alter table public.website_upload_tokens enable row level security;

-- Owner-of-tenant can read their tokens. Mutations go through service
-- role only (the builder + the public /u/[token] endpoint both use the
-- admin client), so we deliberately do NOT create insert/update/delete
-- policies for the anon/authed role.
drop policy if exists website_upload_tokens_select_own on public.website_upload_tokens;
create policy website_upload_tokens_select_own
  on public.website_upload_tokens
  for select
  to authenticated
  using (tenant_id::text = (auth.uid())::text);
