begin;

alter table if exists public.invoices
  add column if not exists estimate_id uuid references public.estimate_builder(id) on delete set null;

create index if not exists invoices_estimate_id_idx
  on public.invoices (estimate_id)
  where estimate_id is not null;

notify pgrst, 'reload schema';

commit;