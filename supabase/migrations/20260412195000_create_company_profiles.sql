begin;

create table if not exists public.company_profiles (
  tenant_id text primary key,
  company_name text not null default '',
  business_type text not null default '',
  logo_data_url text not null default '',
  website_url text not null default '',
  google_reviews_url text not null default '',
  phone text not null default '',
  business_address text not null default '',
  po_box_address text not null default '',
  legal_footer text not null default '',
  document_language text not null default 'en',
  force_english_translation boolean not null default false,
  default_tax_state text not null default 'TX',
  default_invoice_due_days integer not null default 14,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  created_by text,
  updated_by text
);

create index if not exists company_profiles_updated_at_idx
  on public.company_profiles (updated_at desc);

commit;