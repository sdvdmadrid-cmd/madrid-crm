begin;

create extension if not exists "pgcrypto";

-- Versioned platform tax reference data (all jurisdictions).
create table if not exists public.payroll_tax_tables (
  id uuid primary key default gen_random_uuid(),
  jurisdiction text not null,
  table_type text not null,
  effective_from date not null,
  effective_to date,
  payload jsonb not null default '{}'::jsonb,
  version_label text not null default '',
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists payroll_tax_tables_jurisdiction_type_from_key
  on public.payroll_tax_tables (jurisdiction, table_type, effective_from);

create index if not exists payroll_tax_tables_effective_idx
  on public.payroll_tax_tables (jurisdiction, table_type, effective_from desc);

-- One row per tenant.
create table if not exists public.payroll_settings (
  tenant_id uuid primary key,
  employer_legal_name text not null default '',
  employer_ein_encrypted text not null default '',
  default_pay_schedule text not null default 'biweekly'
    check (default_pay_schedule in ('weekly', 'biweekly', 'semimonthly', 'monthly')),
  pay_week_start_day smallint not null default 1 check (pay_week_start_day between 0 and 6),
  default_work_state text not null default '',
  futa_rate numeric(8,5) not null default 0.006,
  suta_rate numeric(8,5) not null default 0.027,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.payroll_employees (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  user_id uuid,
  first_name text not null default '',
  last_name text not null default '',
  email text not null default '',
  phone text not null default '',
  address_street text not null default '',
  address_city text not null default '',
  address_state text not null default '',
  address_zip text not null default '',
  work_state text not null default '',
  ssn_encrypted text not null default '',
  ssn_last4 text not null default '',
  tax_form text not null default 'w2'
    check (tax_form in ('w2', '1099')),
  pay_type text not null default 'hourly'
    check (pay_type in ('hourly', 'salary')),
  hourly_rate numeric(12,2) not null default 0 check (hourly_rate >= 0),
  annual_salary numeric(12,2) not null default 0 check (annual_salary >= 0),
  filing_status text not null default 'single'
    check (filing_status in ('single', 'married', 'head_of_household')),
  w4_extra_withholding numeric(12,2) not null default 0,
  w4_data jsonb not null default '{}'::jsonb,
  direct_deposit_encrypted text not null default '',
  direct_deposit_last4 text not null default '',
  status text not null default 'active'
    check (status in ('active', 'inactive', 'terminated')),
  hire_date date,
  termination_date date,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists payroll_employees_tenant_status_idx
  on public.payroll_employees (tenant_id, status, last_name, first_name);

create table if not exists public.payroll_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  user_id uuid,
  schedule_type text not null default 'biweekly'
    check (schedule_type in ('weekly', 'biweekly', 'semimonthly', 'monthly')),
  period_start date not null,
  period_end date not null,
  pay_date date not null,
  status text not null default 'draft'
    check (status in ('draft', 'calculated', 'approved', 'finalized', 'void')),
  title text not null default '',
  notes text not null default '',
  tax_table_version text not null default '',
  totals jsonb not null default '{}'::jsonb,
  approved_by uuid,
  approved_at timestamptz,
  finalized_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists payroll_runs_tenant_period_idx
  on public.payroll_runs (tenant_id, period_end desc, created_at desc);

create table if not exists public.payroll_run_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  run_id uuid not null references public.payroll_runs(id) on delete cascade,
  employee_id uuid not null references public.payroll_employees(id) on delete restrict,
  hours_regular numeric(10,2) not null default 0 check (hours_regular >= 0),
  hours_overtime numeric(10,2) not null default 0 check (hours_overtime >= 0),
  hourly_rate numeric(12,2) not null default 0 check (hourly_rate >= 0),
  gross_pay numeric(12,2) not null default 0,
  deductions jsonb not null default '{}'::jsonb,
  employer_taxes jsonb not null default '{}'::jsonb,
  net_pay numeric(12,2) not null default 0,
  stub_snapshot jsonb not null default '{}'::jsonb,
  ytd_snapshot jsonb not null default '{}'::jsonb,
  notes text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (run_id, employee_id)
);

create index if not exists payroll_run_items_run_idx
  on public.payroll_run_items (run_id);

create index if not exists payroll_run_items_employee_idx
  on public.payroll_run_items (employee_id, created_at desc);

-- Federal + FICA defaults (2026). State withholding uses flat rates until bracket tables ship.
insert into public.payroll_tax_tables (jurisdiction, table_type, effective_from, version_label, payload)
values
  (
    'US-FED',
    'federal_withholding',
    '2026-01-01',
    '2026-simplified',
    '{"single":0.12,"married":0.10,"head_of_household":0.11}'::jsonb
  ),
  (
    'US-FED',
    'fica',
    '2026-01-01',
    '2026',
    '{"socialSecurityRate":0.062,"medicareRate":0.0145,"additionalMedicareRate":0.009,"socialSecurityWageBase":184500,"additionalMedicareThreshold":200000}'::jsonb
  ),
  (
    'US-FED',
    'futa',
    '2026-01-01',
    '2026',
    '{"rate":0.006,"wageBase":7000}'::jsonb
  )
on conflict do nothing;

-- Seed simplified flat state income tax rates (0 for no-income-tax states).
insert into public.payroll_tax_tables (jurisdiction, table_type, effective_from, version_label, payload)
select
  'US-' || code,
  'state_withholding',
  '2026-01-01'::date,
  '2026-flat-estimate',
  jsonb_build_object('flatRate', case when code in ('TX','FL','WA','NV','WY','SD','TN','NH','AK') then 0 else 0.05 end)
from (
  values
    ('AL'),('AK'),('AZ'),('AR'),('CA'),('CO'),('CT'),('DE'),('FL'),('GA'),
    ('HI'),('ID'),('IL'),('IN'),('IA'),('KS'),('KY'),('LA'),('ME'),('MD'),
    ('MA'),('MI'),('MN'),('MS'),('MO'),('MT'),('NE'),('NV'),('NH'),('NJ'),
    ('NM'),('NY'),('NC'),('ND'),('OH'),('OK'),('OR'),('PA'),('RI'),('SC'),
    ('SD'),('TN'),('TX'),('UT'),('VT'),('VA'),('WA'),('WV'),('WI'),('WY')
) as states(code)
on conflict do nothing;

-- RLS
alter table public.payroll_settings enable row level security;
alter table public.payroll_employees enable row level security;
alter table public.payroll_runs enable row level security;
alter table public.payroll_run_items enable row level security;
alter table public.payroll_tax_tables enable row level security;

drop policy if exists payroll_settings_tenant on public.payroll_settings;
create policy payroll_settings_tenant on public.payroll_settings
  for all using (public.safe_can_access_tenant(tenant_id))
  with check (public.safe_can_access_tenant(tenant_id));

drop policy if exists payroll_employees_tenant on public.payroll_employees;
create policy payroll_employees_tenant on public.payroll_employees
  for all using (public.safe_can_access_tenant(tenant_id))
  with check (public.safe_can_access_tenant(tenant_id));

drop policy if exists payroll_runs_tenant on public.payroll_runs;
create policy payroll_runs_tenant on public.payroll_runs
  for all using (public.safe_can_access_tenant(tenant_id))
  with check (public.safe_can_access_tenant(tenant_id));

drop policy if exists payroll_run_items_tenant on public.payroll_run_items;
create policy payroll_run_items_tenant on public.payroll_run_items
  for all using (public.safe_can_access_tenant(tenant_id))
  with check (public.safe_can_access_tenant(tenant_id));

-- Tax tables: read-only for authenticated users (platform reference data).
drop policy if exists payroll_tax_tables_read on public.payroll_tax_tables;
create policy payroll_tax_tables_read on public.payroll_tax_tables
  for select using (auth.uid() is not null);

commit;
