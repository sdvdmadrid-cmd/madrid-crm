begin;

alter table if exists public.payments
  add column if not exists tenant_id uuid,
  add column if not exists user_id uuid,
  add column if not exists job_id uuid,
  add column if not exists client_id uuid,
  add column if not exists currency text default 'usd',
  add column if not exists provider text default 'stripe',
  add column if not exists metadata jsonb default '{}'::jsonb,
  add column if not exists created_by uuid,
  add column if not exists updated_at timestamptz default now(),
  add column if not exists checkout_url text,
  add column if not exists stripe_payment_intent_id text,
  add column if not exists completed_at timestamptz,
  add column if not exists failed_at timestamptz;

update public.payments
set updated_at = coalesce(updated_at, created_at, now())
where updated_at is null;

commit;