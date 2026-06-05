begin;

-- Tenant-scoped vendor directory (no global predefined suppliers).
create table if not exists public.vendors (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  name text not null,
  category text not null default 'other'
    check (category in (
      'material_store',
      'subcontractor',
      'equipment_rental',
      'dump_site',
      'fuel',
      'nursery',
      'trucking',
      'office',
      'other'
    )),
  contact_person text not null default '',
  phone text not null default '',
  email text not null default '',
  website text not null default '',
  address_street text not null default '',
  address_city text not null default '',
  address_state text not null default '',
  address_zip text not null default '',
  payment_terms text not null default '',
  notes text not null default '',
  documents jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists vendors_tenant_name_idx
  on public.vendors (tenant_id, lower(name));

create index if not exists vendors_tenant_category_idx
  on public.vendors (tenant_id, category);

-- Link bills to tenant vendors and optional jobs; support attachments & portal links.
alter table public.bills
  add column if not exists vendor_id uuid references public.vendors(id) on delete set null,
  add column if not exists job_id uuid references public.jobs(id) on delete set null,
  add column if not exists portal_url text not null default '',
  add column if not exists attachment_path text not null default '',
  add column if not exists attachment_name text not null default '';

create index if not exists bills_tenant_vendor_idx
  on public.bills (tenant_id, vendor_id);

create index if not exists bills_tenant_job_idx
  on public.bills (tenant_id, job_id)
  where job_id is not null;

-- Daily job reports for crew, materials, equipment, weather, photos.
create table if not exists public.job_daily_reports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  job_id uuid not null references public.jobs(id) on delete cascade,
  user_id uuid not null,
  report_date date not null,
  crew jsonb not null default '[]'::jsonb,
  materials text not null default '',
  equipment text not null default '',
  weather text not null default '',
  notes text not null default '',
  photo_file_ids uuid[] not null default '{}',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint job_daily_reports_unique_day unique (tenant_id, job_id, report_date)
);

create index if not exists job_daily_reports_job_date_idx
  on public.job_daily_reports (tenant_id, job_id, report_date desc);

-- Deprecate global bill_providers catalog (national bill-pay network).
update public.bills set provider_id = null where provider_id is not null;
delete from public.bill_providers;

comment on table public.bill_providers is
  'Deprecated. FieldBase uses tenant-scoped vendors. Do not seed predefined suppliers.';

alter table public.vendors enable row level security;
alter table public.job_daily_reports enable row level security;

drop policy if exists vendors_tenant on public.vendors;
create policy vendors_tenant on public.vendors
  for all using (public.safe_can_access_tenant(tenant_id))
  with check (public.safe_can_access_tenant(tenant_id));

drop policy if exists job_daily_reports_tenant on public.job_daily_reports;
create policy job_daily_reports_tenant on public.job_daily_reports
  for all using (public.safe_can_access_tenant(tenant_id))
  with check (public.safe_can_access_tenant(tenant_id));

notify pgrst, 'reload schema';

commit;
