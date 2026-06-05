begin;

-- Extended employee profile fields
alter table public.payroll_employees
  add column if not exists date_of_birth date,
  add column if not exists federal_exempt boolean not null default false,
  add column if not exists state_exempt boolean not null default false,
  add column if not exists state_withholding_extra numeric(12,2) not null default 0,
  add column if not exists state_withholding_data jsonb not null default '{}'::jsonb,
  add column if not exists pto_balance_hours numeric(10,2) not null default 0 check (pto_balance_hours >= 0),
  add column if not exists sick_balance_hours numeric(10,2) not null default 0 check (sick_balance_hours >= 0);

-- Job costing on pay run lines
alter table public.payroll_run_items
  add column if not exists job_id uuid references public.jobs(id) on delete set null,
  add column if not exists pto_hours numeric(10,2) not null default 0 check (pto_hours >= 0),
  add column if not exists sick_hours numeric(10,2) not null default 0 check (sick_hours >= 0),
  add column if not exists correction_of_item_id uuid references public.payroll_run_items(id) on delete set null;

create index if not exists payroll_run_items_job_idx
  on public.payroll_run_items (job_id)
  where job_id is not null;

-- Correction runs reference original
alter table public.payroll_runs
  add column if not exists correction_of_run_id uuid references public.payroll_runs(id) on delete set null;

-- Job labor rollups (updated when pay runs finalize)
alter table public.jobs
  add column if not exists labor_cost_total numeric(12,2) not null default 0,
  add column if not exists labor_hours_total numeric(10,2) not null default 0;

-- Time tracking
create table if not exists public.payroll_time_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  employee_id uuid not null references public.payroll_employees(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  entry_type text not null default 'regular'
    check (entry_type in ('regular', 'overtime', 'pto', 'sick', 'break')),
  status text not null default 'open'
    check (status in ('open', 'submitted', 'approved', 'void')),
  clock_in timestamptz,
  clock_out timestamptz,
  hours numeric(10,2) not null default 0 check (hours >= 0),
  hourly_rate numeric(12,2) not null default 0 check (hourly_rate >= 0),
  pay_run_item_id uuid references public.payroll_run_items(id) on delete set null,
  notes text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists payroll_time_entries_tenant_employee_idx
  on public.payroll_time_entries (tenant_id, employee_id, clock_in desc);

create index if not exists payroll_time_entries_tenant_job_idx
  on public.payroll_time_entries (tenant_id, job_id)
  where job_id is not null;

create index if not exists payroll_time_entries_open_clock_idx
  on public.payroll_time_entries (tenant_id, employee_id)
  where status = 'open' and clock_out is null;

-- ACH export batches
create table if not exists public.payroll_ach_batches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  run_id uuid not null references public.payroll_runs(id) on delete cascade,
  status text not null default 'exported'
    check (status in ('draft', 'exported', 'transmitted', 'void')),
  file_name text not null default '',
  file_content text not null default '',
  total_amount numeric(14,2) not null default 0,
  entry_count integer not null default 0,
  exported_by uuid,
  exported_at timestamptz not null default timezone('utc', now()),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists payroll_ach_batches_run_idx
  on public.payroll_ach_batches (run_id);

-- Performance indexes for dashboard/reports at scale
create index if not exists payroll_runs_tenant_pay_date_idx
  on public.payroll_runs (tenant_id, pay_date desc)
  where status in ('approved', 'finalized');

create index if not exists payroll_run_items_tenant_created_idx
  on public.payroll_run_items (tenant_id, created_at desc);

create index if not exists payroll_employees_tenant_active_idx
  on public.payroll_employees (tenant_id)
  where status = 'active';

-- State SUTA rates (employer unemployment) — versioned platform data
insert into public.payroll_tax_tables (jurisdiction, table_type, effective_from, version_label, payload)
select
  'US-' || code,
  'state_suta',
  '2026-01-01'::date,
  '2026-suta-estimate',
  jsonb_build_object(
    'sutaRate',
    case code
      when 'CA' then 0.034
      when 'NY' then 0.041
      when 'TX' then 0.031
      when 'FL' then 0.027
      when 'WA' then 0.021
      when 'AK' then 0.021
      when 'NV' then 0.027
      when 'WY' then 0.027
      when 'SD' then 0.012
      when 'TN' then 0.027
      when 'NH' then 0.017
      else 0.027
    end,
    'wageBase', 7000
  )
from (
  values
    ('AL'),('AK'),('AZ'),('AR'),('CA'),('CO'),('CT'),('DE'),('FL'),('GA'),
    ('HI'),('ID'),('IL'),('IN'),('IA'),('KS'),('KY'),('LA'),('ME'),('MD'),
    ('MA'),('MI'),('MN'),('MS'),('MO'),('MT'),('NE'),('NV'),('NH'),('NJ'),
    ('NM'),('NY'),('NC'),('ND'),('OH'),('OK'),('OR'),('PA'),('RI'),('SC'),
    ('SD'),('TN'),('TX'),('UT'),('VT'),('VA'),('WA'),('WV'),('WI'),('WY')
) as states(code)
on conflict (jurisdiction, table_type, effective_from) do nothing;

-- RLS for new tables
alter table public.payroll_time_entries enable row level security;
alter table public.payroll_ach_batches enable row level security;

drop policy if exists payroll_time_entries_tenant on public.payroll_time_entries;
create policy payroll_time_entries_tenant on public.payroll_time_entries
  for all using (public.safe_can_access_tenant(tenant_id))
  with check (public.safe_can_access_tenant(tenant_id));

drop policy if exists payroll_ach_batches_tenant on public.payroll_ach_batches;
create policy payroll_ach_batches_tenant on public.payroll_ach_batches
  for all using (public.safe_can_access_tenant(tenant_id))
  with check (public.safe_can_access_tenant(tenant_id));

commit;
