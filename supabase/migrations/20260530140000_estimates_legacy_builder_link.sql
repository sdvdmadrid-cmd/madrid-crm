begin;

-- Link migrated pipeline estimates back to legacy estimate_builder rows.
alter table if exists public.estimates
  add column if not exists legacy_builder_id uuid;

create unique index if not exists estimates_legacy_builder_id_unique_idx
  on public.estimates (legacy_builder_id)
  where legacy_builder_id is not null;

comment on column public.estimates.legacy_builder_id is
  'Set when this estimates row was migrated from public.estimate_builder; preserves FK/history without using estimate_builder as the live workflow.';

commit;
