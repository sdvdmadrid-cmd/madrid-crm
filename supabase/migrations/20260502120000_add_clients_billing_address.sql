begin;

alter table if exists public.clients
  add column if not exists billing_address      text    not null default '',
  add column if not exists billing_city         text    not null default '',
  add column if not exists billing_state        text    not null default '',
  add column if not exists billing_zip          text    not null default '',
  add column if not exists billing_same_as_service boolean not null default true;

notify pgrst, 'reload schema';

commit;
