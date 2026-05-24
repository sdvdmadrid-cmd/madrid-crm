-- Production lead capture fields for contractor website requests

alter table public.contractor_website_leads
  add column if not exists budget_range text,
  add column if not exists timeline text,
  add column if not exists contact_preference text,
  add column if not exists submission_id text,
  add column if not exists photo_url text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create unique index if not exists contractor_website_leads_submission_id_idx
  on public.contractor_website_leads (submission_id)
  where submission_id is not null;

create index if not exists contractor_website_leads_created_tenant_idx
  on public.contractor_website_leads (tenant_id, created_at desc);

-- Extend status values
alter table public.contractor_website_leads
  drop constraint if exists contractor_website_leads_status_check;

alter table public.contractor_website_leads
  add constraint contractor_website_leads_status_check
  check (status in ('new', 'contacted', 'completed', 'converted', 'archived'));
