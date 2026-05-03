-- Create estimate_requests table for internal quote/change follow-up workflow

create table if not exists public.estimate_requests (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null,
  user_id        uuid,
  job_id         uuid,
  quote_token    text,
  request_type   text not null default 'change',
  item           text,
  message        text not null default '',
  client_name    text not null default '',
  job_title      text not null default '',
  contact_name   text not null default '',
  contact_email  text not null default '',
  contact_phone  text not null default '',
  status         text not null default 'pending' check (status in ('pending', 'reviewed', 'resolved', 'new')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists estimate_requests_tenant_created_idx
  on public.estimate_requests (tenant_id, created_at desc);

create index if not exists estimate_requests_tenant_status_idx
  on public.estimate_requests (tenant_id, status);

create index if not exists estimate_requests_contact_email_idx
  on public.estimate_requests (contact_email);

alter table public.estimate_requests enable row level security;

create policy "Estimate requests tenant select"
  on public.estimate_requests
  for select
  to authenticated
  using (public.can_access_tenant(tenant_id));

create policy "Estimate requests tenant insert"
  on public.estimate_requests
  for insert
  to authenticated
  with check (public.can_access_tenant(tenant_id));

create policy "Estimate requests tenant update"
  on public.estimate_requests
  for update
  to authenticated
  using (public.can_access_tenant(tenant_id))
  with check (public.can_access_tenant(tenant_id));

create policy "Estimate requests public insert"
  on public.estimate_requests
  for insert
  with check (true);
