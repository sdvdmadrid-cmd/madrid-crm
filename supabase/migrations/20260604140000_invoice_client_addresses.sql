-- Snapshot customer / job-site addresses on invoices for PDF, print, and email.
alter table public.invoices
  add column if not exists client_phone text not null default '',
  add column if not exists client_address text not null default '',
  add column if not exists property_address text not null default '';
