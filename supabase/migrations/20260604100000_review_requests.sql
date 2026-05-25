-- Review request system: lets a contractor send a one-tap "leave a
-- review" link to a customer via email/SMS after a job is completed.
-- The token is opaque; verification + state lives in this row.
create table if not exists public.review_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  requested_by_user_id uuid,
  -- Optional refs back to the customer-facing record this request
  -- relates to. We keep them nullable + textual so we don't force a
  -- foreign-key relationship that could block deletes elsewhere.
  job_id uuid,
  invoice_id uuid,
  estimate_id uuid,
  customer_name text not null default '',
  customer_email text not null default '',
  customer_phone text not null default '',
  -- One-way opaque token. Indexed unique so the public route can do an
  -- O(1) lookup without a tenant scope.
  token text not null,
  status text not null default 'sent' check (status in ('sent', 'responded', 'expired', 'revoked')),
  -- Optional context the contractor can include in the email body.
  message text not null default '',
  channel text not null default 'email' check (channel in ('email', 'sms', 'both', 'manual')),
  -- Will be filled when the customer submits a review through this link.
  review_id uuid,
  rating numeric(3,1),
  expires_at timestamptz not null default (now() + interval '60 days'),
  responded_at timestamptz,
  revoked_at timestamptz,
  reminder_sent_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists review_requests_token_idx
  on public.review_requests (token);

create index if not exists review_requests_tenant_idx
  on public.review_requests (tenant_id, created_at desc);

create index if not exists review_requests_status_idx
  on public.review_requests (tenant_id, status)
  where status in ('sent', 'responded');

alter table public.review_requests enable row level security;

drop policy if exists review_requests_select_own on public.review_requests;
create policy review_requests_select_own
  on public.review_requests
  for select
  to authenticated
  using (tenant_id::text = (auth.uid())::text);
