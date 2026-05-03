-- Add detailed address fields to website leads for realistic quote intake

alter table public.contractor_website_leads
  add column if not exists address_line_1 text,
  add column if not exists house_number text,
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists zip_code text;

-- Fast filtering by location for sales operations
create index if not exists contractor_website_leads_location_idx
  on public.contractor_website_leads (tenant_id, state, city, zip_code);