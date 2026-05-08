-- Add sequential numbering support to estimate_builder
alter table public.estimate_builder
  add column if not exists estimate_number text not null default '',
  add column if not exists client_name text not null default '';

-- Backfill estimate_number for existing rows that don't have one
-- Use a CTE with row_number, then join in the UPDATE
with numbered as (
  select id,
    'EST-' || lpad(row_number() over (partition by tenant_id order by created_at)::text, 4, '0') as new_num
  from public.estimate_builder
  where estimate_number = ''
)
update public.estimate_builder eb
set estimate_number = numbered.new_num
from numbered
where eb.id = numbered.id;

create index if not exists estimate_builder_estimate_number_idx
  on public.estimate_builder (tenant_id, estimate_number);
