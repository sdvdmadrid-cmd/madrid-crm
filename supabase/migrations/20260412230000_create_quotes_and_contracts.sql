begin;

create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  user_id uuid,
  quote_number text not null default '',
  title text not null default '',
  client_id text not null default '',
  client_name text not null default '',
  client_email text not null default '',
  client_phone text not null default '',
  address_line1 text not null default '',
  address_line2 text not null default '',
  city text not null default '',
  state text not null default '',
  zip text not null default '',
  property_address text not null default '',
  line_items jsonb not null default '[]'::jsonb,
  scope_of_work text not null default '',
  status text not null default 'draft',
  quote_token text,
  quote_shared_at timestamptz,
  sent_at timestamptz,
  viewed_at timestamptz,
  email_opened_at timestamptz,
  approved_at timestamptz,
  created_by text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists quotes_tenant_created_idx
  on public.quotes (tenant_id, created_at desc);
create unique index if not exists quotes_quote_token_unique_idx
  on public.quotes (quote_token)
  where quote_token is not null;

create table if not exists public.contracts (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  user_id uuid,
  client_id text not null default '',
  client_name text not null default '',
  job_id text not null default '',
  job_title text not null default '',
  invoice_id text not null default '',
  invoice_number text not null default '',
  amount text not null default '',
  status text not null default 'Draft',
  contract_language text not null default 'en',
  contract_category text not null default '',
  contract_option text not null default '',
  body text not null default '',
  created_by text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists contracts_tenant_created_idx
  on public.contracts (tenant_id, created_at desc);

commit;
