begin;

create extension if not exists "pgcrypto";

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  user_id uuid,
  created_by uuid,
  name text not null default '',
  phone text,
  email text,
  address text,
  company text not null default '',
  notes text not null default '',
  lead_status text not null default 'new_lead',
  estimate_sent boolean not null default false,
  won_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  user_id uuid,
  created_by uuid,
  client_id uuid references public.clients(id) on delete set null,
  title text not null default '',
  description text,
  status text not null default 'Pending',
  created_at timestamptz not null default timezone('utc', now()),
  client_name text not null default '',
  service text not null default '',
  price text not null default '',
  due_date text not null default '',
  tax_state text not null default '',
  down_payment_percent text not null default '0',
  scope_details text not null default '',
  square_meters text not null default '',
  complexity text not null default 'standard',
  materials_included boolean not null default true,
  travel_minutes text not null default '',
  urgency text not null default 'flexible',
  estimate_snapshot jsonb,
  updated_at timestamptz not null default timezone('utc', now()),
  quote_token text,
  quote_shared_at timestamptz,
  quote_sent_at timestamptz,
  quote_sent_to text not null default '',
  quote_status text not null default 'draft',
  quote_approved_at timestamptz,
  quote_signed_at timestamptz,
  quote_approved_by_name text not null default '',
  quote_approved_by_email text not null default '',
  quote_signed_by_name text not null default '',
  quote_signed_by_email text not null default '',
  quote_signature_text text not null default '',
  contract_id uuid references public.contracts(id) on delete set null
);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.jobs(id) on delete set null,
  user_id uuid,
  items jsonb not null default '[]'::jsonb,
  subtotal_cents bigint default 0,
  tax_cents bigint default 0,
  total_cents bigint default 0,
  status text not null default 'Unpaid',
  due_date timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  tenant_id uuid,
  client_id uuid references public.clients(id) on delete set null,
  invoice_number text not null default '',
  invoice_title text not null default '',
  client_name text not null default '',
  client_email text not null default '',
  amount numeric(12,2) not null default 0,
  notes text not null default '',
  preferred_payment_method text not null default 'bank_transfer',
  payments jsonb not null default '[]'::jsonb,
  paid_amount numeric(12,2) not null default 0,
  balance_due numeric(12,2) not null default 0,
  created_by uuid,
  updated_at timestamptz not null default timezone('utc', now()),
  last_checkout_session_id text not null default '',
  last_checkout_url text not null default '',
  invoice_email_last_attempt_at timestamptz,
  invoice_email_last_attempt_to text not null default '',
  invoice_email_sent_at timestamptz,
  invoice_email_sent_to text not null default '',
  stripe_last_payment_session_id text not null default '',
  stripe_last_payment_at timestamptz,
  contract_id uuid references public.contracts(id) on delete set null,
  contract_status text not null default ''
);

create table if not exists public.estimates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  user_id uuid,
  created_by uuid,
  client_id uuid references public.clients(id) on delete set null,
  client_name text not null default '',
  job_id uuid references public.jobs(id) on delete set null,
  estimate_number text not null default '',
  status text not null default 'Draft',
  currency text not null default 'USD',
  items jsonb not null default '[]'::jsonb,
  subtotal numeric(12,2) not null default 0,
  tax numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table if exists public.clients
  add column if not exists tenant_id uuid,
  add column if not exists user_id uuid,
  add column if not exists created_by uuid,
  add column if not exists name text not null default '',
  add column if not exists phone text,
  add column if not exists email text,
  add column if not exists address text,
  add column if not exists company text not null default '',
  add column if not exists notes text not null default '',
  add column if not exists lead_status text not null default 'new_lead',
  add column if not exists estimate_sent boolean not null default false,
  add column if not exists won_at timestamptz,
  add column if not exists created_at timestamptz not null default timezone('utc', now()),
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

alter table if exists public.jobs
  add column if not exists tenant_id uuid,
  add column if not exists user_id uuid,
  add column if not exists created_by uuid,
  add column if not exists client_id uuid references public.clients(id) on delete set null,
  add column if not exists title text not null default '',
  add column if not exists description text,
  add column if not exists status text not null default 'Pending',
  add column if not exists created_at timestamptz not null default timezone('utc', now()),
  add column if not exists client_name text not null default '',
  add column if not exists service text not null default '',
  add column if not exists price text not null default '',
  add column if not exists due_date text not null default '',
  add column if not exists tax_state text not null default '',
  add column if not exists down_payment_percent text not null default '0',
  add column if not exists scope_details text not null default '',
  add column if not exists square_meters text not null default '',
  add column if not exists complexity text not null default 'standard',
  add column if not exists materials_included boolean not null default true,
  add column if not exists travel_minutes text not null default '',
  add column if not exists urgency text not null default 'flexible',
  add column if not exists estimate_snapshot jsonb,
  add column if not exists updated_at timestamptz not null default timezone('utc', now()),
  add column if not exists quote_token text,
  add column if not exists quote_shared_at timestamptz,
  add column if not exists quote_sent_at timestamptz,
  add column if not exists quote_sent_to text not null default '',
  add column if not exists quote_status text not null default 'draft',
  add column if not exists quote_approved_at timestamptz,
  add column if not exists quote_signed_at timestamptz,
  add column if not exists quote_approved_by_name text not null default '',
  add column if not exists quote_approved_by_email text not null default '',
  add column if not exists quote_signed_by_name text not null default '',
  add column if not exists quote_signed_by_email text not null default '',
  add column if not exists quote_signature_text text not null default '',
  add column if not exists contract_id uuid references public.contracts(id) on delete set null;

alter table if exists public.invoices
  add column if not exists job_id uuid references public.jobs(id) on delete set null,
  add column if not exists user_id uuid,
  add column if not exists items jsonb not null default '[]'::jsonb,
  add column if not exists subtotal_cents bigint default 0,
  add column if not exists tax_cents bigint default 0,
  add column if not exists total_cents bigint default 0,
  add column if not exists status text not null default 'Unpaid',
  add column if not exists due_date timestamptz,
  add column if not exists created_at timestamptz not null default timezone('utc', now()),
  add column if not exists tenant_id uuid,
  add column if not exists client_id uuid references public.clients(id) on delete set null,
  add column if not exists invoice_number text not null default '',
  add column if not exists invoice_title text not null default '',
  add column if not exists client_name text not null default '',
  add column if not exists client_email text not null default '',
  add column if not exists amount numeric(12,2) not null default 0,
  add column if not exists notes text not null default '',
  add column if not exists preferred_payment_method text not null default 'bank_transfer',
  add column if not exists payments jsonb not null default '[]'::jsonb,
  add column if not exists paid_amount numeric(12,2) not null default 0,
  add column if not exists balance_due numeric(12,2) not null default 0,
  add column if not exists created_by uuid,
  add column if not exists updated_at timestamptz not null default timezone('utc', now()),
  add column if not exists last_checkout_session_id text not null default '',
  add column if not exists last_checkout_url text not null default '',
  add column if not exists invoice_email_last_attempt_at timestamptz,
  add column if not exists invoice_email_last_attempt_to text not null default '',
  add column if not exists invoice_email_sent_at timestamptz,
  add column if not exists invoice_email_sent_to text not null default '',
  add column if not exists stripe_last_payment_session_id text not null default '',
  add column if not exists stripe_last_payment_at timestamptz,
  add column if not exists contract_id uuid references public.contracts(id) on delete set null,
  add column if not exists contract_status text not null default '';

alter table if exists public.estimates
  add column if not exists tenant_id uuid,
  add column if not exists user_id uuid,
  add column if not exists created_by uuid,
  add column if not exists client_id uuid references public.clients(id) on delete set null,
  add column if not exists client_name text not null default '',
  add column if not exists job_id uuid references public.jobs(id) on delete set null,
  add column if not exists estimate_number text not null default '',
  add column if not exists status text not null default 'Draft',
  add column if not exists currency text not null default 'USD',
  add column if not exists items jsonb not null default '[]'::jsonb,
  add column if not exists subtotal numeric(12,2) not null default 0,
  add column if not exists tax numeric(12,2) not null default 0,
  add column if not exists total numeric(12,2) not null default 0,
  add column if not exists notes text,
  add column if not exists created_at timestamptz not null default timezone('utc', now()),
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

alter table if exists public.clients
  alter column user_id drop not null;

alter table if exists public.jobs
  alter column user_id drop not null,
  alter column client_id drop not null;

alter table if exists public.invoices
  alter column user_id drop not null,
  alter column job_id drop not null;

create index if not exists clients_tenant_id_idx on public.clients (tenant_id);
create index if not exists jobs_tenant_id_idx on public.jobs (tenant_id);
create index if not exists jobs_client_id_idx on public.jobs (client_id);
create unique index if not exists jobs_quote_token_unique_idx
  on public.jobs (quote_token)
  where quote_token is not null;
create index if not exists jobs_contract_id_idx
  on public.jobs (contract_id)
  where contract_id is not null;
create index if not exists invoices_tenant_id_idx on public.invoices (tenant_id);
create index if not exists invoices_job_id_idx on public.invoices (job_id);
create index if not exists invoices_client_id_idx on public.invoices (client_id);
create index if not exists invoices_contract_id_idx
  on public.invoices (contract_id)
  where contract_id is not null;
create index if not exists estimates_tenant_id_idx on public.estimates (tenant_id);
create index if not exists estimates_client_id_idx on public.estimates (client_id);
create index if not exists estimates_job_id_idx on public.estimates (job_id);

do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'can_access_tenant'
      and pg_get_function_identity_arguments(p.oid) = 'row_tenant_id uuid'
  ) and exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'is_admin_profile'
      and pg_get_function_identity_arguments(p.oid) = ''
  ) then
    alter table public.clients enable row level security;
    alter table public.clients force row level security;
    drop policy if exists clients_rbac_select on public.clients;
    drop policy if exists clients_rbac_insert on public.clients;
    drop policy if exists clients_rbac_update on public.clients;
    drop policy if exists clients_rbac_delete_admin on public.clients;
    create policy clients_rbac_select
      on public.clients
      for select
      to authenticated
      using (public.can_access_tenant(tenant_id));
    create policy clients_rbac_insert
      on public.clients
      for insert
      to authenticated
      with check (public.can_access_tenant(tenant_id));
    create policy clients_rbac_update
      on public.clients
      for update
      to authenticated
      using (public.can_access_tenant(tenant_id))
      with check (public.can_access_tenant(tenant_id));
    create policy clients_rbac_delete_admin
      on public.clients
      for delete
      to authenticated
      using (public.can_access_tenant(tenant_id) and public.is_admin_profile());

    alter table public.jobs enable row level security;
    alter table public.jobs force row level security;
    drop policy if exists jobs_rbac_select on public.jobs;
    drop policy if exists jobs_rbac_insert on public.jobs;
    drop policy if exists jobs_rbac_update on public.jobs;
    drop policy if exists jobs_rbac_delete_admin on public.jobs;
    create policy jobs_rbac_select
      on public.jobs
      for select
      to authenticated
      using (public.can_access_tenant(tenant_id));
    create policy jobs_rbac_insert
      on public.jobs
      for insert
      to authenticated
      with check (public.can_access_tenant(tenant_id));
    create policy jobs_rbac_update
      on public.jobs
      for update
      to authenticated
      using (public.can_access_tenant(tenant_id))
      with check (public.can_access_tenant(tenant_id));
    create policy jobs_rbac_delete_admin
      on public.jobs
      for delete
      to authenticated
      using (public.can_access_tenant(tenant_id) and public.is_admin_profile());

    alter table public.estimates enable row level security;
    alter table public.estimates force row level security;
    drop policy if exists estimates_rbac_select on public.estimates;
    drop policy if exists estimates_rbac_insert on public.estimates;
    drop policy if exists estimates_rbac_update on public.estimates;
    drop policy if exists estimates_rbac_delete_admin on public.estimates;
    create policy estimates_rbac_select
      on public.estimates
      for select
      to authenticated
      using (public.can_access_tenant(tenant_id));
    create policy estimates_rbac_insert
      on public.estimates
      for insert
      to authenticated
      with check (public.can_access_tenant(tenant_id));
    create policy estimates_rbac_update
      on public.estimates
      for update
      to authenticated
      using (public.can_access_tenant(tenant_id))
      with check (public.can_access_tenant(tenant_id));
    create policy estimates_rbac_delete_admin
      on public.estimates
      for delete
      to authenticated
      using (public.can_access_tenant(tenant_id) and public.is_admin_profile());

    alter table public.invoices enable row level security;
    alter table public.invoices force row level security;
    drop policy if exists invoices_rbac_select on public.invoices;
    drop policy if exists invoices_rbac_insert_admin on public.invoices;
    drop policy if exists invoices_rbac_update_admin on public.invoices;
    drop policy if exists invoices_rbac_delete_admin on public.invoices;
    create policy invoices_rbac_select
      on public.invoices
      for select
      to authenticated
      using (public.can_access_tenant(tenant_id));
    create policy invoices_rbac_insert_admin
      on public.invoices
      for insert
      to authenticated
      with check (public.can_access_tenant(tenant_id) and public.is_admin_profile());
    create policy invoices_rbac_update_admin
      on public.invoices
      for update
      to authenticated
      using (public.can_access_tenant(tenant_id) and public.is_admin_profile())
      with check (public.can_access_tenant(tenant_id) and public.is_admin_profile());
    create policy invoices_rbac_delete_admin
      on public.invoices
      for delete
      to authenticated
      using (public.can_access_tenant(tenant_id) and public.is_admin_profile());
  end if;
end $$;

notify pgrst, 'reload schema';

commit;