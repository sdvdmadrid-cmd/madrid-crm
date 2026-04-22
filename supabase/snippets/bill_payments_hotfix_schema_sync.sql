begin;

create extension if not exists "pgcrypto";

create table if not exists public.bill_providers (
  id uuid primary key default gen_random_uuid(),
  provider_name text not null,
  normalized_name text not null,
  category text not null default 'general',
  website_url text not null default '',
  support_phone text not null default '',
  search_terms text[] not null default '{}',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists bill_providers_normalized_name_key
  on public.bill_providers (normalized_name);

alter table public.bill_payment_customers
  add column if not exists tenant_id uuid,
  add column if not exists user_id uuid,
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

create unique index if not exists bill_payment_customers_tenant_user_key
  on public.bill_payment_customers (tenant_id, user_id)
  where tenant_id is not null and user_id is not null;

create table if not exists public.bill_payment_methods (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  user_id uuid not null,
  stripe_customer_id text not null,
  stripe_payment_method_id text not null,
  method_type text not null default 'card',
  method_label text not null default '',
  brand text not null default '',
  bank_name text not null default '',
  last4 text not null default '',
  exp_month integer,
  exp_year integer,
  fingerprint text not null default '',
  is_default boolean not null default false,
  allow_autopay boolean not null default true,
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists bill_payment_methods_stripe_payment_method_key
  on public.bill_payment_methods (stripe_payment_method_id);

create index if not exists bill_payment_methods_tenant_user_idx
  on public.bill_payment_methods (tenant_id, user_id, created_at desc);

create unique index if not exists bill_payment_methods_default_per_user_idx
  on public.bill_payment_methods (tenant_id, user_id)
  where is_default = true;

create table if not exists public.bills (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  user_id uuid not null,
  provider_id uuid references public.bill_providers(id) on delete set null,
  provider_name text not null,
  account_label text not null default '',
  account_reference_masked text not null default '',
  account_reference_hash text not null default '',
  amount_due numeric(12,2) not null default 0,
  minimum_amount numeric(12,2),
  currency text not null default 'usd',
  due_date date not null,
  schedule_anchor_date date,
  status text not null default 'open',
  source text not null default 'manual',
  tags text[] not null default '{}',
  notes text not null default '',
  autopay_enabled boolean not null default false,
  last_paid_at timestamptz,
  last_payment_id uuid,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists bills_tenant_due_date_idx
  on public.bills (tenant_id, due_date asc, created_at desc);

create index if not exists bills_tenant_status_idx
  on public.bills (tenant_id, status, updated_at desc);

create index if not exists bills_tenant_user_idx
  on public.bills (tenant_id, user_id, created_at desc);

create table if not exists public.bill_payment_transactions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  user_id uuid not null,
  bill_id uuid not null references public.bills(id) on delete cascade,
  payment_method_id uuid references public.bill_payment_methods(id) on delete set null,
  provider_name text not null default '',
  account_reference_masked text not null default '',
  amount numeric(12,2) not null,
  currency text not null default 'usd',
  status text not null default 'scheduled',
  source text not null default 'manual',
  bulk_batch_id uuid,
  stripe_payment_intent_id text,
  stripe_payment_method_id text,
  receipt_url text not null default '',
  scheduled_for timestamptz,
  processed_at timestamptz,
  failed_at timestamptz,
  failure_reason text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists bill_payment_transactions_stripe_intent_key
  on public.bill_payment_transactions (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

create index if not exists bill_payment_transactions_bill_created_idx
  on public.bill_payment_transactions (bill_id, created_at desc);

create index if not exists bill_payment_transactions_tenant_status_idx
  on public.bill_payment_transactions (tenant_id, status, created_at desc);

create table if not exists public.bill_autopay_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  user_id uuid not null,
  bill_id uuid not null unique references public.bills(id) on delete cascade,
  payment_method_id uuid references public.bill_payment_methods(id) on delete set null,
  enabled boolean not null default false,
  paused boolean not null default false,
  rule_type text not null default 'full_balance',
  fixed_amount numeric(12,2),
  schedule_type text not null default 'due_date',
  days_before_due integer,
  monthly_day integer,
  notify_days_before integer not null default 3,
  last_notified_at timestamptz,
  last_processed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists bill_autopay_rules_tenant_enabled_idx
  on public.bill_autopay_rules (tenant_id, enabled, paused, updated_at desc);

notify pgrst, 'reload schema';
notify pgrst, 'reload config';

commit;
