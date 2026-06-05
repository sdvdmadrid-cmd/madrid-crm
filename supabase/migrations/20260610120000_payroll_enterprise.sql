begin;

-- Audit trail for all payroll mutations
create table if not exists public.payroll_audit_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  actor_id uuid,
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  before_snapshot jsonb not null default '{}'::jsonb,
  after_snapshot jsonb not null default '{}'::jsonb,
  notes text not null default '',
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists payroll_audit_log_tenant_entity_idx
  on public.payroll_audit_log (tenant_id, entity_type, entity_id, created_at desc);

-- Void tracking on runs
alter table public.payroll_runs
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid,
  add column if not exists void_reason text not null default '',
  add column if not exists run_type text not null default 'regular'
    check (run_type in ('regular', 'bonus', 'correction', 'void_reversal'));

-- Accounting integration
create table if not exists public.payroll_expense_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  run_id uuid references public.payroll_runs(id) on delete set null,
  run_item_id uuid references public.payroll_run_items(id) on delete set null,
  job_id uuid references public.jobs(id) on delete set null,
  employee_id uuid references public.payroll_employees(id) on delete set null,
  expense_type text not null default 'labor'
    check (expense_type in ('labor', 'employer_tax', 'bonus', 'correction')),
  gross_amount numeric(12,2) not null default 0,
  employer_tax_amount numeric(12,2) not null default 0,
  labor_burden numeric(12,2) not null default 0,
  journal_entry jsonb not null default '{}'::jsonb,
  period_date date not null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists payroll_expense_records_tenant_period_idx
  on public.payroll_expense_records (tenant_id, period_date desc);

create index if not exists payroll_expense_records_job_idx
  on public.payroll_expense_records (tenant_id, job_id)
  where job_id is not null;

-- Payroll calendar / reminders
create table if not exists public.payroll_reminders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  reminder_type text not null default 'upcoming_run'
    check (reminder_type in ('upcoming_run', 'approval_needed', 'missing_hours', 'year_end')),
  title text not null default '',
  message text not null default '',
  due_date date,
  run_id uuid references public.payroll_runs(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'dismissed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists payroll_reminders_tenant_status_idx
  on public.payroll_reminders (tenant_id, status, due_date);

-- Link employees to auth users for portal
create index if not exists payroll_employees_user_id_idx
  on public.payroll_employees (tenant_id, user_id)
  where user_id is not null;

-- Pub 15-T federal percentage method tables (2026)
insert into public.payroll_tax_tables (jurisdiction, table_type, effective_from, version_label, payload)
values (
  'US-FED',
  'federal_pub15t',
  '2026-01-01',
  '2026-pub15t-percentage',
  '{"method":"percentage","note":"Loaded from application defaults; override via payload.schedules"}'::jsonb
)
on conflict (jurisdiction, table_type, effective_from) do nothing;

-- CA / NY bracket withholding seeds
insert into public.payroll_tax_tables (jurisdiction, table_type, effective_from, version_label, payload)
values
  (
    'US-CA',
    'state_withholding_brackets',
    '2026-01-01',
    '2026-ca-estimate',
    '{"schedules":{"biweekly":{"single":[{"max":500,"base":0,"over":0,"rate":0.01},{"max":1200,"base":5,"over":500,"rate":0.02},{"max":2500,"base":19,"over":1200,"rate":0.04},{"max":5000,"base":71,"over":2500,"rate":0.06},{"max":999999999,"base":221,"over":5000,"rate":0.093}]}}}'::jsonb
  ),
  (
    'US-NY',
    'state_withholding_brackets',
    '2026-01-01',
    '2026-ny-estimate',
    '{"schedules":{"biweekly":{"single":[{"max":400,"base":0,"over":0,"rate":0.04},{"max":1500,"base":16,"over":400,"rate":0.045},{"max":4000,"base":65.5,"over":1500,"rate":0.0525},{"max":999999999,"base":196.75,"over":4000,"rate":0.0585}]}}}'::jsonb
  ),
  (
    'US-CA',
    'state_employer',
    '2026-01-01',
    '2026-ca',
    '{"ettRate":0.001,"ettWageBase":7000}'::jsonb
  ),
  (
    'US-CA',
    'state_employee',
    '2026-01-01',
    '2026-ca',
    '{"sdiRate":0.011,"sdiWageBase":153164}'::jsonb
  ),
  (
    'US-NY',
    'state_employee',
    '2026-01-01',
    '2026-ny',
    '{"sdiRate":0.005,"sdiWageBase":12000}'::jsonb
  ),
  (
    'US-NY',
    'local_tax',
    '2026-01-01',
    '2026-nyc',
    '{"rates":{"US-NY-NYC":0.03078}}'::jsonb
  )
on conflict (jurisdiction, table_type, effective_from) do nothing;

-- RLS
alter table public.payroll_audit_log enable row level security;
alter table public.payroll_expense_records enable row level security;
alter table public.payroll_reminders enable row level security;

drop policy if exists payroll_audit_log_tenant on public.payroll_audit_log;
create policy payroll_audit_log_tenant on public.payroll_audit_log
  for all using (public.safe_can_access_tenant(tenant_id))
  with check (public.safe_can_access_tenant(tenant_id));

drop policy if exists payroll_expense_records_tenant on public.payroll_expense_records;
create policy payroll_expense_records_tenant on public.payroll_expense_records
  for all using (public.safe_can_access_tenant(tenant_id))
  with check (public.safe_can_access_tenant(tenant_id));

drop policy if exists payroll_reminders_tenant on public.payroll_reminders;
create policy payroll_reminders_tenant on public.payroll_reminders
  for all using (public.safe_can_access_tenant(tenant_id))
  with check (public.safe_can_access_tenant(tenant_id));

commit;
