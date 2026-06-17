-- Contractor-only notes; never shown on PDFs, emails, or client payment pages.
alter table public.invoices
  add column if not exists internal_notes text not null default '';
