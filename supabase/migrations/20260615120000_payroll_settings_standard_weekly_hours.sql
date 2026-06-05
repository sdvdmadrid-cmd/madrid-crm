begin;

alter table public.payroll_settings
  add column if not exists standard_weekly_hours numeric(5,2) not null default 40
  check (standard_weekly_hours > 0 and standard_weekly_hours <= 168);

commit;
