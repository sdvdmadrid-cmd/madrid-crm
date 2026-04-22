begin;

alter table if exists public.invoices
  add column if not exists stripe_session_id text not null default '';

create index if not exists invoices_stripe_session_id_idx
  on public.invoices (stripe_session_id)
  where stripe_session_id <> '';

notify pgrst, 'reload schema';

commit;