begin;

create extension if not exists "uuid-ossp";

create table if not exists public.appointments (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null,
  title text not null default '',
  client text not null default '',
  date date,
  time time,
  status text not null default 'scheduled',
  created_at timestamptz not null default now()
);

create index if not exists appointments_tenant_date_idx
  on public.appointments (tenant_id, date, time);

alter table public.appointments enable row level security;
alter table public.appointments force row level security;

drop policy if exists appointments_insert_own on public.appointments;
create policy appointments_insert_own
  on public.appointments
  for insert
  to authenticated
  with check (tenant_id = auth.uid());

drop policy if exists appointments_select_own on public.appointments;
create policy appointments_select_own
  on public.appointments
  for select
  to authenticated
  using (tenant_id = auth.uid());

notify pgrst, 'reload schema';

commit;