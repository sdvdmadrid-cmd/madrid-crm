-- Hardening: prevent duplicate quote / invoice numbers within the same tenant.
--
-- Both /api/estimate-builder/[id]/share-link and
-- /api/estimate-builder/[id]/promote allocate quote numbers via
-- MAX(numeric suffix) + 1 with a retry-on-23505 loop. The retry was
-- previously dead code because no unique index existed on
-- (tenant_id, quote_number) — concurrent calls would both compute the
-- same suffix, both pass the read-then-insert idempotency check, and
-- both inserts would succeed.
--
-- /api/estimates/[id]/respond's ensureQuoteForApprovedEstimate has
-- the same hazard: it does a "look up by (tenant_id, quote_number)
-- then insert if missing" check that is non-transactional. Two
-- simultaneous approvals on the same estimate would both pass the
-- existence check and create duplicate quote rows.
--
-- /api/estimate-builder/[id]/checkout allocates invoice numbers via
-- COUNT(*) + 1 today, which is collision-prone even without
-- concurrency (deleting any invoice shifts subsequent numbers onto
-- existing rows). The follow-up commit rewrites that to MAX+1 with
-- retry, and this index is what makes the retry actually do
-- something.
--
-- Both indexes are partial: rows with NULL or empty numbers are
-- excluded so legacy data (which the older codebase produced when
-- a manual number was missing) is not retroactively blocked. New
-- code paths always generate a non-empty number.
--
-- DEPLOYMENT GUARD: this migration assumes zero existing duplicate
-- (tenant_id, quote_number) and (tenant_id, invoice_number) pairs
-- with non-empty numbers. Run the queries below in production BEFORE
-- applying this migration and confirm both return zero rows. If
-- either returns rows, clean them up (renumber or delete) before
-- proceeding — the migration will otherwise fail with a clear unique
-- index violation.
--
--   select tenant_id, quote_number, count(*) from public.quotes
--     where coalesce(trim(quote_number), '') <> ''
--     group by tenant_id, quote_number having count(*) > 1;
--   select tenant_id, invoice_number, count(*) from public.invoices
--     where coalesce(trim(invoice_number), '') <> ''
--     group by tenant_id, invoice_number having count(*) > 1;

create unique index if not exists quotes_tenant_number_unique_idx
  on public.quotes (tenant_id, quote_number)
  where quote_number is not null and length(trim(quote_number)) > 0;

create unique index if not exists invoices_tenant_number_unique_idx
  on public.invoices (tenant_id, invoice_number)
  where invoice_number is not null and length(trim(invoice_number)) > 0;
