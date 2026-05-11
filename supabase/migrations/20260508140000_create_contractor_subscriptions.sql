begin;

-- Subscription plans table
create table if not exists public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  price_monthly numeric(10, 2) not null check (price_monthly > 0),
  trial_days int not null default 30,
  features jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique(name)
);

-- Contractor subscriptions
create table if not exists public.contractor_subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  plan_id uuid not null,
  stripe_subscription_id text,
  stripe_customer_id text,
  status text not null default 'trialing' check (status in ('trialing', 'active', 'paused', 'past_due', 'cancelled')),
  trial_ends_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancelled_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique(tenant_id, plan_id)
);

-- Subscription invoices history
create table if not exists public.subscription_invoices (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null,
  tenant_id uuid not null,
  amount numeric(12, 2) not null check (amount >= 0),
  currency text not null default 'usd',
  status text not null default 'draft' check (status in ('draft', 'open', 'paid', 'failed', 'void', 'uncollectible')),
  stripe_invoice_id text,
  stripe_payment_intent_id text,
  period_start timestamptz,
  period_end timestamptz,
  paid_at timestamptz,
  due_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- Add foreign key constraints
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'contractor_subscriptions_plan_id_fkey'
  ) then
    alter table public.contractor_subscriptions
      add constraint contractor_subscriptions_plan_id_fkey
      foreign key (plan_id) references public.subscription_plans(id) on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'subscription_invoices_subscription_id_fkey'
  ) then
    alter table public.subscription_invoices
      add constraint subscription_invoices_subscription_id_fkey
      foreign key (subscription_id) references public.contractor_subscriptions(id) on delete cascade;
  end if;

end $$;

-- Create indexes
create index if not exists idx_contractor_subscriptions_tenant on public.contractor_subscriptions(tenant_id);
create index if not exists idx_contractor_subscriptions_status on public.contractor_subscriptions(status);
create index if not exists idx_contractor_subscriptions_stripe_sub on public.contractor_subscriptions(stripe_subscription_id);
create index if not exists idx_subscription_invoices_subscription on public.subscription_invoices(subscription_id);
create index if not exists idx_subscription_invoices_tenant on public.subscription_invoices(tenant_id);
create index if not exists idx_subscription_invoices_stripe_invoice on public.subscription_invoices(stripe_invoice_id);

-- RLS policies
alter table public.subscription_plans enable row level security;
alter table public.contractor_subscriptions enable row level security;
alter table public.subscription_invoices enable row level security;

-- subscription_plans: anyone can read active plans
drop policy if exists "plans_read_all" on public.subscription_plans;
create policy "plans_read_all" on public.subscription_plans
  for select using (is_active = true);

-- contractor_subscriptions: tenants can only see their own
drop policy if exists "subscriptions_read_own" on public.contractor_subscriptions;
create policy "subscriptions_read_own" on public.contractor_subscriptions
  for select using (
    public.can_access_tenant(tenant_id)
  );

drop policy if exists "subscriptions_create_own" on public.contractor_subscriptions;
create policy "subscriptions_create_own" on public.contractor_subscriptions
  for insert with check (
    public.can_access_tenant(tenant_id)
  );

drop policy if exists "subscriptions_update_own" on public.contractor_subscriptions;
create policy "subscriptions_update_own" on public.contractor_subscriptions
  for update using (
    public.can_access_tenant(tenant_id)
  )
  with check (
    public.can_access_tenant(tenant_id)
  );

-- subscription_invoices: tenants can only see their own
drop policy if exists "invoices_read_own" on public.subscription_invoices;
create policy "invoices_read_own" on public.subscription_invoices
  for select using (
    public.can_access_tenant(tenant_id)
  );

drop policy if exists "invoices_create_own" on public.subscription_invoices;
create policy "invoices_create_own" on public.subscription_invoices
  for insert with check (
    public.can_access_tenant(tenant_id)
  );

drop policy if exists "invoices_update_own" on public.subscription_invoices;
create policy "invoices_update_own" on public.subscription_invoices
  for update using (
    public.can_access_tenant(tenant_id)
  )
  with check (
    public.can_access_tenant(tenant_id)
  );

-- Insert default subscription plan
insert into public.subscription_plans (name, description, price_monthly, trial_days, features, is_active)
  values (
    'Contractor Pro',
    'Monthly subscription for contractors',
    35.00,
    30,
    '[
      "Bill payments management",
      "AutoPay scheduling",
      "Payment history",
      "Email invoices",
      "Mobile app access",
      "Priority support"
    ]'::jsonb,
    true
  )
  on conflict (name) do nothing;

commit;
