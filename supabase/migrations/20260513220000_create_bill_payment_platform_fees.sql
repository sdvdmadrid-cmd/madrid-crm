begin;

create table if not exists public.bill_payment_platform_fees (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  user_id uuid not null,
  stripe_customer_id text not null default '',
  payment_method_id uuid references public.bill_payment_methods(id) on delete set null,
  stripe_payment_method_id text not null default '',
  charge_month text not null,
  amount numeric(12,2) not null default 0,
  currency text not null default 'usd',
  status text not null default 'processing',
  stripe_payment_intent_id text,
  charged_at timestamptz,
  failed_at timestamptz,
  failure_reason text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint bill_payment_platform_fees_status_check
    check (status in ('processing', 'paid', 'failed')),
  constraint bill_payment_platform_fees_charge_month_check
    check (charge_month ~ '^\\d{4}-\\d{2}$')
);

create unique index if not exists bill_payment_platform_fees_tenant_user_month_key
  on public.bill_payment_platform_fees (tenant_id, user_id, charge_month);

create index if not exists bill_payment_platform_fees_status_idx
  on public.bill_payment_platform_fees (status, created_at desc);

create index if not exists bill_payment_platform_fees_tenant_created_idx
  on public.bill_payment_platform_fees (tenant_id, created_at desc);

create unique index if not exists bill_payment_platform_fees_stripe_intent_key
  on public.bill_payment_platform_fees (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

notify pgrst, 'reload schema';

commit;
