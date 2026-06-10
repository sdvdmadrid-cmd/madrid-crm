-- Jobber CRM integration: external IDs, relational child tables, integration metadata.
-- SECURITY: tables below MUST enable RLS in the same migration (see _example_public_table_with_rls.sql.example).
-- Historical gap (no RLS block) fixed in 20260629120000; CI + DB event trigger prevent recurrence.

alter table if exists public.integrations
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table if exists public.clients
  add column if not exists jobber_id text,
  add column if not exists jobber_metadata jsonb not null default '{}'::jsonb;

create unique index if not exists clients_tenant_jobber_id_unique_idx
  on public.clients (tenant_id, jobber_id)
  where jobber_id is not null and length(trim(jobber_id)) > 0;

alter table if exists public.jobs
  add column if not exists jobber_id text;

create unique index if not exists jobs_tenant_jobber_id_unique_idx
  on public.jobs (tenant_id, jobber_id)
  where jobber_id is not null and length(trim(jobber_id)) > 0;

alter table if exists public.quotes
  add column if not exists jobber_id text;

create unique index if not exists quotes_tenant_jobber_id_unique_idx
  on public.quotes (tenant_id, jobber_id)
  where jobber_id is not null and length(trim(jobber_id)) > 0;

alter table if exists public.estimate_builder
  add column if not exists jobber_id text;

create unique index if not exists estimate_builder_tenant_jobber_id_unique_idx
  on public.estimate_builder (tenant_id, jobber_id)
  where jobber_id is not null and length(trim(jobber_id)) > 0;

alter table if exists public.invoices
  add column if not exists jobber_id text;

create unique index if not exists invoices_tenant_jobber_id_unique_idx
  on public.invoices (tenant_id, jobber_id)
  where jobber_id is not null and length(trim(jobber_id)) > 0;

create table if not exists public.client_properties (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  client_id uuid not null references public.clients(id) on delete cascade,
  jobber_id text,
  label text not null default '',
  address text not null default '',
  city text not null default '',
  state text not null default '',
  zip_code text not null default '',
  is_primary boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists client_properties_tenant_jobber_unique_idx
  on public.client_properties (tenant_id, jobber_id)
  where jobber_id is not null and length(trim(jobber_id)) > 0;

create index if not exists client_properties_client_idx
  on public.client_properties (client_id);

create table if not exists public.client_notes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  client_id uuid not null references public.clients(id) on delete cascade,
  jobber_id text,
  body text not null default '',
  source text not null default 'jobber',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists client_notes_tenant_jobber_unique_idx
  on public.client_notes (tenant_id, jobber_id)
  where jobber_id is not null and length(trim(jobber_id)) > 0;

create index if not exists client_notes_client_idx
  on public.client_notes (client_id, created_at desc);

create table if not exists public.client_visits (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  client_id uuid not null references public.clients(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  jobber_id text,
  title text not null default '',
  status text not null default '',
  start_at timestamptz,
  end_at timestamptz,
  completed_at timestamptz,
  instructions text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists client_visits_tenant_jobber_unique_idx
  on public.client_visits (tenant_id, jobber_id)
  where jobber_id is not null and length(trim(jobber_id)) > 0;

create index if not exists client_visits_client_idx
  on public.client_visits (client_id, start_at desc);

create table if not exists public.client_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  client_id uuid not null references public.clients(id) on delete cascade,
  jobber_id text,
  title text not null default '',
  status text not null default '',
  details text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists client_requests_tenant_jobber_unique_idx
  on public.client_requests (tenant_id, jobber_id)
  where jobber_id is not null and length(trim(jobber_id)) > 0;

create index if not exists client_requests_client_idx
  on public.client_requests (client_id, created_at desc);
