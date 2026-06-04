begin;

alter table public.appointments
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists address_place_id text;

notify pgrst, 'reload schema';

commit;
