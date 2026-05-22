-- Payments hardening: align status enum, contractor_id, webhook idempotency (Connect prep)
begin;

-- contractor_id: app code uses this alongside tenant_id for payment scoping
alter table if exists public.payments
  add column if not exists contractor_id uuid;

update public.payments
set contractor_id = coalesce(contractor_id, tenant_id)
where contractor_id is null and tenant_id is not null;

-- Status values: webhooks use 'paid'; legacy rows may use 'completed'
alter table if exists public.payments
  drop constraint if exists payments_status_check;

alter table if exists public.payments
  add constraint payments_status_check
  check (
    status in (
      'pending',
      'paid',
      'completed',
      'processing',
      'failed',
      'expired',
      'canceled',
      'refunded',
      'disputed'
    )
  );

-- Backfill completed -> paid for consistency with application code
update public.payments
set status = 'paid'
where status = 'completed';

create index if not exists payments_contractor_invoice_idx
  on public.payments (contractor_id, invoice_id, created_at desc)
  where contractor_id is not null;

-- Stripe webhook idempotency (used when Inngest is disabled)
create table if not exists public.stripe_webhook_events (
  id text primary key,
  event_type text not null default '',
  processed_at timestamptz not null default timezone('utc', now()),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists stripe_webhook_events_processed_at_idx
  on public.stripe_webhook_events (processed_at desc);

alter table public.stripe_webhook_events enable row level security;
alter table public.stripe_webhook_events force row level security;

-- Service role only (webhooks use supabaseAdmin)
drop policy if exists stripe_webhook_events_service on public.stripe_webhook_events;
create policy stripe_webhook_events_service
  on public.stripe_webhook_events
  for all
  to service_role
  using (true)
  with check (true);

-- Contractor Connect fields on company profile (nullable until onboarding ships)
alter table if exists public.company_profiles
  add column if not exists stripe_connect_account_id text,
  add column if not exists stripe_connect_charges_enabled boolean not null default false,
  add column if not exists stripe_connect_payouts_enabled boolean not null default false,
  add column if not exists stripe_connect_onboarded_at timestamptz;

create unique index if not exists company_profiles_stripe_connect_account_id_unique_idx
  on public.company_profiles (stripe_connect_account_id)
  where stripe_connect_account_id is not null and stripe_connect_account_id <> '';

notify pgrst, 'reload schema';

commit;
