begin;

-- Job expense tracking (materials, vendor, equipment, dump, sub, fuel)
create table if not exists public.job_expenses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  job_id uuid not null references public.jobs(id) on delete cascade,
  category text not null default 'other'
    check (category in (
      'material', 'vendor', 'equipment', 'dump_fee',
      'subcontractor', 'fuel', 'other'
    )),
  vendor_name text not null default '',
  description text not null default '',
  amount numeric(12,2) not null default 0 check (amount >= 0),
  expense_date date not null default current_date,
  receipt_file_id uuid references public.job_files(id) on delete set null,
  ocr_data jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists job_expenses_tenant_job_idx
  on public.job_expenses (tenant_id, job_id, expense_date desc);

create index if not exists job_expenses_tenant_category_idx
  on public.job_expenses (tenant_id, category);

-- Equipment inventory
create table if not exists public.equipment (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  name text not null default '',
  equipment_type text not null default '',
  hourly_rate numeric(12,2) not null default 0 check (hourly_rate >= 0),
  purchase_cost numeric(12,2) not null default 0 check (purchase_cost >= 0),
  maintenance_schedule text not null default '',
  last_service_date date,
  next_service_date date,
  status text not null default 'active'
    check (status in ('active', 'maintenance', 'retired')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists equipment_tenant_status_idx
  on public.equipment (tenant_id, status);

-- Equipment assigned to jobs
create table if not exists public.equipment_job_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  equipment_id uuid not null references public.equipment(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  hours numeric(10,2) not null default 0 check (hours >= 0),
  cost_amount numeric(12,2) not null default 0 check (cost_amount >= 0),
  assigned_date date not null default current_date,
  notes text not null default '',
  created_by uuid,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists equipment_job_assignments_job_idx
  on public.equipment_job_assignments (tenant_id, job_id);

-- Job cost rollups
alter table public.jobs
  add column if not exists material_cost_total numeric(12,2) not null default 0,
  add column if not exists equipment_cost_total numeric(12,2) not null default 0,
  add column if not exists subcontractor_cost_total numeric(12,2) not null default 0,
  add column if not exists other_cost_total numeric(12,2) not null default 0,
  add column if not exists total_job_cost numeric(12,2) not null default 0;

-- Allow receipt file type on job files (validated in app layer)
comment on column public.job_files.file_type is 'photo | document | receipt';

alter table public.job_expenses enable row level security;
alter table public.equipment enable row level security;
alter table public.equipment_job_assignments enable row level security;

drop policy if exists job_expenses_tenant on public.job_expenses;
create policy job_expenses_tenant on public.job_expenses
  for all using (public.safe_can_access_tenant(tenant_id))
  with check (public.safe_can_access_tenant(tenant_id));

drop policy if exists equipment_tenant on public.equipment;
create policy equipment_tenant on public.equipment
  for all using (public.safe_can_access_tenant(tenant_id))
  with check (public.safe_can_access_tenant(tenant_id));

drop policy if exists equipment_job_assignments_tenant on public.equipment_job_assignments;
create policy equipment_job_assignments_tenant on public.equipment_job_assignments
  for all using (public.safe_can_access_tenant(tenant_id))
  with check (public.safe_can_access_tenant(tenant_id));

commit;
