begin;

alter table if exists public.clients
  add column if not exists city text not null default '',
  add column if not exists state text not null default '',
  add column if not exists zip_code text not null default '',
  add column if not exists latitude double precision,
  add column if not exists longitude double precision;

notify pgrst, 'reload schema';

commit;
