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

create index if not exists bill_providers_category_name_idx
  on public.bill_providers (category, normalized_name);

insert into public.bill_providers (
  provider_name,
  normalized_name,
  category,
  website_url,
  support_phone,
  search_terms
)
values
  (
    'Comcast Business',
    'comcast business',
    'utilities',
    'https://business.comcast.com',
    '800-391-3000',
    array['internet', 'phone', 'utility', 'xfinity', 'business internet']
  ),
  (
    'AT&T Business',
    'at&t business',
    'utilities',
    'https://www.att.com/smallbusiness/',
    '800-321-2000',
    array['wireless', 'internet', 'phone', 'att']
  ),
  (
    'PG&E',
    'pg&e',
    'utilities',
    'https://www.pge.com',
    '800-743-5000',
    array['electric', 'gas', 'utility', 'power']
  ),
  (
    'Southern California Edison',
    'southern california edison',
    'utilities',
    'https://www.sce.com',
    '800-655-4555',
    array['electric', 'utility', 'edison', 'power']
  ),
  (
    'Home Depot Pro',
    'home depot pro',
    'vendor',
    'https://www.homedepot.com/pro',
    '800-430-3376',
    array['materials', 'supplier', 'vendor', 'home depot']
  ),
  (
    'Grainger',
    'grainger',
    'vendor',
    'https://www.grainger.com',
    '800-472-4643',
    array['supplier', 'vendor', 'equipment', 'parts']
  )
on conflict (normalized_name) do update
set
  provider_name = excluded.provider_name,
  category = excluded.category,
  website_url = excluded.website_url,
  support_phone = excluded.support_phone,
  search_terms = excluded.search_terms,
  updated_at = timezone('utc', now());

create table if not exists public.bill_payment_customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  user_id uuid not null,
  stripe_customer_id text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists bill_payment_customers_tenant_user_key
  on public.bill_payment_customers (tenant_id, user_id);

create unique index if not exists bill_payment_customers_stripe_customer_key
  on public.bill_payment_customers (stripe_customer_id);

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

alter table public.bill_providers enable row level security;
alter table public.bill_providers force row level security;
alter table public.bill_payment_customers enable row level security;
alter table public.bill_payment_customers force row level security;
alter table public.bill_payment_methods enable row level security;
alter table public.bill_payment_methods force row level security;
alter table public.bills enable row level security;
alter table public.bills force row level security;
alter table public.bill_payment_transactions enable row level security;
alter table public.bill_payment_transactions force row level security;
alter table public.bill_autopay_rules enable row level security;
alter table public.bill_autopay_rules force row level security;

drop policy if exists bill_providers_select on public.bill_providers;
drop policy if exists bill_payment_customers_select on public.bill_payment_customers;
drop policy if exists bill_payment_customers_insert on public.bill_payment_customers;
drop policy if exists bill_payment_customers_update on public.bill_payment_customers;
drop policy if exists bill_payment_methods_select on public.bill_payment_methods;
drop policy if exists bill_payment_methods_insert on public.bill_payment_methods;
drop policy if exists bill_payment_methods_update on public.bill_payment_methods;
drop policy if exists bill_payment_methods_delete on public.bill_payment_methods;
drop policy if exists bills_select on public.bills;
drop policy if exists bills_insert on public.bills;
drop policy if exists bills_update on public.bills;
drop policy if exists bills_delete on public.bills;
drop policy if exists bill_payment_transactions_select on public.bill_payment_transactions;
drop policy if exists bill_payment_transactions_insert on public.bill_payment_transactions;
drop policy if exists bill_payment_transactions_update on public.bill_payment_transactions;
drop policy if exists bill_autopay_rules_select on public.bill_autopay_rules;
drop policy if exists bill_autopay_rules_insert on public.bill_autopay_rules;
drop policy if exists bill_autopay_rules_update on public.bill_autopay_rules;
drop policy if exists bill_autopay_rules_delete on public.bill_autopay_rules;

create policy bill_providers_select
  on public.bill_providers
  for select
  to authenticated
  using (true);

create policy bill_payment_customers_select
  on public.bill_payment_customers
  for select
  to authenticated
  using (public.can_access_tenant(tenant_id));

create policy bill_payment_customers_insert
  on public.bill_payment_customers
  for insert
  to authenticated
  with check (public.can_access_tenant(tenant_id));

create policy bill_payment_customers_update
  on public.bill_payment_customers
  for update
  to authenticated
  using (public.can_access_tenant(tenant_id))
  with check (public.can_access_tenant(tenant_id));

create policy bill_payment_methods_select
  on public.bill_payment_methods
  for select
  to authenticated
  using (public.can_access_tenant(tenant_id));

create policy bill_payment_methods_insert
  on public.bill_payment_methods
  for insert
  to authenticated
  with check (public.can_access_tenant(tenant_id));

create policy bill_payment_methods_update
  on public.bill_payment_methods
  for update
  to authenticated
  using (public.can_access_tenant(tenant_id))
  with check (public.can_access_tenant(tenant_id));

create policy bill_payment_methods_delete
  on public.bill_payment_methods
  for delete
  to authenticated
  using (public.can_access_tenant(tenant_id) and public.is_admin_profile());

create policy bills_select
  on public.bills
  for select
  to authenticated
  using (public.can_access_tenant(tenant_id));

create policy bills_insert
  on public.bills
  for insert
  to authenticated
  with check (public.can_access_tenant(tenant_id));

create policy bills_update
  on public.bills
  for update
  to authenticated
  using (public.can_access_tenant(tenant_id))
  with check (public.can_access_tenant(tenant_id));

create policy bills_delete
  on public.bills
  for delete
  to authenticated
  using (public.can_access_tenant(tenant_id) and public.is_admin_profile());

create policy bill_payment_transactions_select
  on public.bill_payment_transactions
  for select
  to authenticated
  using (public.can_access_tenant(tenant_id));

create policy bill_payment_transactions_insert
  on public.bill_payment_transactions
  for insert
  to authenticated
  with check (public.can_access_tenant(tenant_id));

create policy bill_payment_transactions_update
  on public.bill_payment_transactions
  for update
  to authenticated
  using (public.can_access_tenant(tenant_id))
  with check (public.can_access_tenant(tenant_id));

create policy bill_autopay_rules_select
  on public.bill_autopay_rules
  for select
  to authenticated
  using (public.can_access_tenant(tenant_id));

create policy bill_autopay_rules_insert
  on public.bill_autopay_rules
  for insert
  to authenticated
  with check (public.can_access_tenant(tenant_id));

create policy bill_autopay_rules_update
  on public.bill_autopay_rules
  for update
  to authenticated
  using (public.can_access_tenant(tenant_id))
  with check (public.can_access_tenant(tenant_id));

create policy bill_autopay_rules_delete
  on public.bill_autopay_rules
  for delete
  to authenticated
  using (public.can_access_tenant(tenant_id) and public.is_admin_profile());

notify pgrst, 'reload schema';

commit;