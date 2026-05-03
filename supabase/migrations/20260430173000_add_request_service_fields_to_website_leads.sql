-- Request Service form extensions: service needed + optional photo payload

alter table public.contractor_website_leads
  add column if not exists service_needed text,
  add column if not exists photo_data_url text;

create index if not exists contractor_website_leads_service_needed_idx
  on public.contractor_website_leads (tenant_id, service_needed);
