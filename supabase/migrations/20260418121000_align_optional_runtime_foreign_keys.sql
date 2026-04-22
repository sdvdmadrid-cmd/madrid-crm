begin;

alter table if exists public.clients
  alter column user_id drop not null;

alter table if exists public.jobs
  alter column user_id drop not null,
  alter column client_id drop not null;

alter table if exists public.invoices
  alter column user_id drop not null,
  alter column job_id drop not null;

alter table if exists public.clients
  drop constraint if exists clients_user_id_fkey;

alter table if exists public.jobs
  drop constraint if exists jobs_user_id_fkey;

alter table if exists public.invoices
  drop constraint if exists invoices_user_id_fkey;

notify pgrst, 'reload schema';

commit;