begin;

-- Ensure invoice quote-link columns exist in all environments.
alter table if exists public.invoices
  add column if not exists quote_id uuid references public.quotes(id) on delete set null;

alter table if exists public.invoices
  add column if not exists quote_number text not null default '';

-- Preserve quote references where invoice number already matches quote number.
update public.invoices as i
set quote_number = q.quote_number
from public.quotes as q
where i.tenant_id = q.tenant_id
  and coalesce(i.quote_number, '') = ''
  and coalesce(i.invoice_number, '') <> ''
  and q.quote_number = i.invoice_number;

-- Backfill quote_id from quote_number when possible.
update public.invoices as i
set quote_id = q.id
from public.quotes as q
where i.tenant_id = q.tenant_id
  and i.quote_id is null
  and coalesce(i.quote_number, '') <> ''
  and q.quote_number = i.quote_number;

create index if not exists invoices_quote_id_idx
  on public.invoices (quote_id)
  where quote_id is not null;

create index if not exists invoices_quote_number_idx
  on public.invoices (quote_number)
  where quote_number <> '';

notify pgrst, 'reload schema';

commit;
