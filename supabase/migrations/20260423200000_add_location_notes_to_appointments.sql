begin;

alter table public.appointments
  add column if not exists location text not null default '',
  add column if not exists notes    text not null default '';

notify pgrst, 'reload schema';

commit;
