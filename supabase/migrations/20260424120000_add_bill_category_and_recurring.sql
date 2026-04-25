-- Add category, is_recurring, and frequency columns to the bills table.
-- These columns power the new category preset system and recurring bill logic.

alter table public.bills
  add column if not exists category text not null default 'general',
  add column if not exists is_recurring boolean not null default false,
  add column if not exists frequency text
    check (frequency in ('weekly', 'monthly', 'yearly'))
    default null;

-- Index to filter / group bills by category quickly.
create index if not exists bills_category_tenant_idx
  on public.bills (tenant_id, category);
