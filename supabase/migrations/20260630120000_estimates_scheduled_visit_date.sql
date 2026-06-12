-- Site visit date for calendar scheduling (Phase C)
alter table if exists public.estimates
  add column if not exists scheduled_visit_date date;

comment on column public.estimates.scheduled_visit_date is
  'Optional site visit date; when set, estimate appears on the calendar grid.';

create index if not exists estimates_tenant_scheduled_visit_date_idx
  on public.estimates (tenant_id, scheduled_visit_date)
  where scheduled_visit_date is not null;
