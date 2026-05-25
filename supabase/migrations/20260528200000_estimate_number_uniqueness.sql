-- Risk fix R2: prevent duplicate estimate numbers within the same tenant.
--
-- The /api/estimates and /api/estimate-builder POST handlers generate
-- "EST-####" identifiers based on max-suffix-plus-one. Without a database
-- guard, two concurrent requests could compute the same number and insert
-- duplicate rows. This migration adds partial UNIQUE indexes scoped to
-- non-empty numbers so legacy rows with NULL/empty numbers are not blocked.
--
-- Verified upfront that there are zero duplicate (tenant_id, estimate_number)
-- pairs in production before adding the constraint.

create unique index if not exists estimates_tenant_number_unique_idx
  on public.estimates (tenant_id, estimate_number)
  where estimate_number is not null and length(trim(estimate_number)) > 0;

create unique index if not exists estimate_builder_tenant_number_unique_idx
  on public.estimate_builder (tenant_id, estimate_number)
  where estimate_number is not null and length(trim(estimate_number)) > 0;
