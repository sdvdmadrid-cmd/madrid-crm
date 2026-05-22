-- Extended website builder content: testimonials, trust badges, tone, etc.

alter table public.contractor_websites
  add column if not exists site_meta jsonb not null default '{}'::jsonb;
