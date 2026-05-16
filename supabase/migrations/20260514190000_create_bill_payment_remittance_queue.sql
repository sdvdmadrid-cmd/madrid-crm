create table if not exists public.bill_payment_remittance_queue (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  user_id uuid not null,
  bill_id uuid not null references public.bills(id) on delete cascade,
  transaction_id uuid not null references public.bill_payment_transactions(id) on delete cascade,
  provider_name text not null default '',
  account_reference_masked text not null default '',
  amount numeric(12,2) not null default 0,
  currency text not null default 'usd',
  status text not null default 'pending_submission',
  reason text not null default 'funded_payment_pending_submission',
  attempts integer not null default 0,
  next_attempt_at timestamptz,
  submitted_at timestamptz,
  submitted_by uuid,
  remittance_reference text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists bill_payment_remittance_queue_tenant_transaction_key
  on public.bill_payment_remittance_queue (tenant_id, transaction_id);

create index if not exists bill_payment_remittance_queue_tenant_status_idx
  on public.bill_payment_remittance_queue (tenant_id, status, created_at desc);

alter table public.bill_payment_remittance_queue enable row level security;
alter table public.bill_payment_remittance_queue force row level security;

create policy bill_payment_remittance_queue_select
  on public.bill_payment_remittance_queue
  for select
  to authenticated
  using (public.can_access_tenant(tenant_id));

create policy bill_payment_remittance_queue_insert
  on public.bill_payment_remittance_queue
  for insert
  to authenticated
  with check (public.can_access_tenant(tenant_id));

create policy bill_payment_remittance_queue_update
  on public.bill_payment_remittance_queue
  for update
  to authenticated
  using (public.can_access_tenant(tenant_id))
  with check (public.can_access_tenant(tenant_id));
