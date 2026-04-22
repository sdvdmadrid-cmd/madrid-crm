begin;

create extension if not exists "pgcrypto";

create or replace function public.try_parse_uuid(value text)
returns uuid
language plpgsql
immutable
as $$
begin
  if value is null or btrim(value) = '' then
    return null;
  end if;

  return value::uuid;
exception
  when others then
    return null;
end;
$$;

alter table if exists public.clients
  add column if not exists tenant_id uuid,
  add column if not exists user_id uuid,
  add column if not exists name text not null default '',
  add column if not exists phone text not null default '',
  add column if not exists email text not null default '',
  add column if not exists address text not null default '',
  add column if not exists company text not null default '',
  add column if not exists notes text not null default '',
  add column if not exists lead_status text not null default 'new_lead',
  add column if not exists estimate_sent boolean not null default false,
  add column if not exists won_at timestamptz,
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz not null default timezone('utc', now()),
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

alter table if exists public.jobs
  add column if not exists tenant_id uuid,
  add column if not exists user_id uuid,
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
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz not null default timezone('utc', now()),
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
  add column if not exists contract_id uuid;

alter table if exists public.invoices
  add column if not exists tenant_id uuid,
  add column if not exists user_id uuid,
  add column if not exists client_id uuid,
  add column if not exists invoice_number text not null default '',
  add column if not exists invoice_title text not null default '',
  add column if not exists client_name text not null default '',
  add column if not exists client_email text not null default '',
  add column if not exists amount numeric(12,2) not null default 0,
  add column if not exists items jsonb not null default '[]'::jsonb,
  add column if not exists notes text not null default '',
  add column if not exists preferred_payment_method text not null default 'bank_transfer',
  add column if not exists payments jsonb not null default '[]'::jsonb,
  add column if not exists paid_amount numeric(12,2) not null default 0,
  add column if not exists balance_due numeric(12,2) not null default 0,
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz not null default timezone('utc', now()),
  add column if not exists updated_at timestamptz not null default timezone('utc', now()),
  add column if not exists last_checkout_session_id text not null default '',
  add column if not exists last_checkout_url text not null default '',
  add column if not exists invoice_email_last_attempt_at timestamptz,
  add column if not exists invoice_email_last_attempt_to text not null default '',
  add column if not exists invoice_email_sent_at timestamptz,
  add column if not exists invoice_email_sent_to text not null default '',
  add column if not exists stripe_last_payment_session_id text not null default '',
  add column if not exists stripe_last_payment_at timestamptz,
  add column if not exists contract_id uuid,
  add column if not exists contract_status text not null default '';

alter table if exists public.estimates
  add column if not exists tenant_id uuid,
  add column if not exists user_id uuid,
  add column if not exists created_by uuid,
  add column if not exists created_at timestamptz not null default timezone('utc', now()),
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

update public.clients
set
  tenant_id = coalesce(tenant_id, public.try_parse_uuid(user_id::text)),
  name = coalesce(name, ''),
  phone = coalesce(phone, ''),
  email = coalesce(email, ''),
  address = coalesce(address, ''),
  company = coalesce(company, ''),
  notes = coalesce(notes, ''),
  lead_status = coalesce(nullif(lead_status, ''), 'new_lead'),
  estimate_sent = coalesce(estimate_sent, false),
  created_at = coalesce(created_at, timezone('utc', now())),
  updated_at = coalesce(updated_at, created_at, timezone('utc', now()))
where true;

update public.jobs
set
  tenant_id = coalesce(tenant_id, public.try_parse_uuid(user_id::text)),
  client_name = coalesce(client_name, ''),
  service = coalesce(service, ''),
  price = coalesce(price, ''),
  due_date = coalesce(due_date, ''),
  tax_state = coalesce(tax_state, ''),
  down_payment_percent = coalesce(nullif(down_payment_percent, ''), '0'),
  scope_details = coalesce(scope_details, ''),
  square_meters = coalesce(square_meters, ''),
  complexity = coalesce(nullif(complexity, ''), 'standard'),
  materials_included = coalesce(materials_included, true),
  travel_minutes = coalesce(travel_minutes, ''),
  urgency = coalesce(nullif(urgency, ''), 'flexible'),
  quote_sent_to = coalesce(quote_sent_to, ''),
  quote_status = coalesce(nullif(quote_status, ''), 'draft'),
  quote_approved_by_name = coalesce(quote_approved_by_name, ''),
  quote_approved_by_email = coalesce(quote_approved_by_email, ''),
  quote_signed_by_name = coalesce(quote_signed_by_name, ''),
  quote_signed_by_email = coalesce(quote_signed_by_email, ''),
  quote_signature_text = coalesce(quote_signature_text, ''),
  created_at = coalesce(created_at, timezone('utc', now())),
  updated_at = coalesce(updated_at, created_at, timezone('utc', now()))
where true;

update public.invoices
set
  tenant_id = coalesce(tenant_id, public.try_parse_uuid(user_id::text)),
  invoice_number = coalesce(invoice_number, ''),
  invoice_title = coalesce(invoice_title, ''),
  client_name = coalesce(client_name, ''),
  client_email = coalesce(client_email, ''),
  amount = coalesce(amount, 0),
  items = coalesce(items, '[]'::jsonb),
  notes = coalesce(notes, ''),
  preferred_payment_method = coalesce(nullif(preferred_payment_method, ''), 'bank_transfer'),
  payments = coalesce(payments, '[]'::jsonb),
  paid_amount = coalesce(paid_amount, 0),
  balance_due = coalesce(balance_due, coalesce(amount, 0)),
  last_checkout_session_id = coalesce(last_checkout_session_id, ''),
  last_checkout_url = coalesce(last_checkout_url, ''),
  invoice_email_last_attempt_to = coalesce(invoice_email_last_attempt_to, ''),
  invoice_email_sent_to = coalesce(invoice_email_sent_to, ''),
  stripe_last_payment_session_id = coalesce(stripe_last_payment_session_id, ''),
  contract_status = coalesce(contract_status, ''),
  created_at = coalesce(created_at, timezone('utc', now())),
  updated_at = coalesce(updated_at, created_at, timezone('utc', now()))
where true;

update public.estimates
set
  tenant_id = coalesce(tenant_id, public.try_parse_uuid(user_id::text)),
  created_at = coalesce(created_at, timezone('utc', now())),
  updated_at = coalesce(updated_at, created_at, timezone('utc', now()))
where true;

create index if not exists clients_tenant_id_idx on public.clients (tenant_id);
create index if not exists jobs_tenant_id_idx on public.jobs (tenant_id);
create index if not exists invoices_tenant_id_idx on public.invoices (tenant_id);
create index if not exists estimates_tenant_id_idx on public.estimates (tenant_id);

notify pgrst, 'reload schema';

commit;