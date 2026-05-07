begin;

-- Add quote tracking to invoices if not already present
alter table if exists public.invoices
  add column if not exists quote_id uuid references public.quotes(id) on delete set null;

alter table if exists public.invoices
  add column if not exists quote_number text not null default '';

-- Index for quote lookups
create index if not exists invoices_quote_id_idx
  on public.invoices (quote_id)
  where quote_id is not null;

create index if not exists invoices_quote_number_idx
  on public.invoices (quote_number)
  where quote_number != '';

notify pgrst, 'reload schema';

commit;
