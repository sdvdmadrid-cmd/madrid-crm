begin;

alter table public.contractor_websites
  add column if not exists gallery_photos jsonb not null default '[]'::jsonb;

commit;
