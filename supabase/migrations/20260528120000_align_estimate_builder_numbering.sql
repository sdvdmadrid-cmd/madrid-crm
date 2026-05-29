-- estimate_builder uses estimate_number + quote_id (FK to quotes.quote_number).
-- It never had a quote_number column; app code that referenced it is corrected
-- in the application layer. This migration ensures numbering columns exist on
-- databases that missed earlier incremental deploys.

alter table public.estimate_builder
  add column if not exists estimate_number text not null default '',
  add column if not exists client_name text not null default '';

with numbered as (
  select id,
    'EST-' || lpad(
      row_number() over (partition by tenant_id order by created_at)::text,
      4,
      '0'
    ) as new_num
  from public.estimate_builder
  where coalesce(estimate_number, '') = ''
)
update public.estimate_builder eb
set estimate_number = numbered.new_num
from numbered
where eb.id = numbered.id;

create index if not exists estimate_builder_estimate_number_idx
  on public.estimate_builder (tenant_id, estimate_number);
