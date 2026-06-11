-- =============================================================================
-- Stage 1: E2E tenant CRM cleanup — DRY-RUN SCRIPT
-- =============================================================================
-- Project:     fieldbaseapp (fhcbnupmdpphzdafmmgd)
-- Target ONLY: 8354b6d2-0c6c-4a95-a16d-3bbb6908c943  (admin@fieldbase.local)
-- Owner:       E2E / Playwright dev-login tenant (confirmed 2026-06-11)
--
-- DO NOT RUN IN PRODUCTION UNTIL:
--   1. Backup / recovery path confirmed (see backup report)
--   2. E2E redirected off production Supabase
--   3. Pre-flight SELECT counts match impact report
--
-- DEFAULT BEHAVIOR: ends with ROLLBACK (no persistent changes)
-- To apply: replace final ROLLBACK with COMMIT after review
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Constants (single-tenant scope — do not modify)
-- ---------------------------------------------------------------------------
-- Stage 1 E2E tenant UUID
-- Real tenants (MUST remain unchanged — used for post-delete verification)
--   d38fec7b-adac-4b7f-a46d-2ccadab6e452  Madrid Landscaping (sdvdmadrid@gmail.com)
--   ebb368d8-248d-4986-8fdd-56a4da7a33d8  JMS ENTERPRICES LLC (madridsan84@yahoo.com)
--   6785ddd8-d0a7-4afd-a97e-1ad9f8e377a4  Susy cleaning services (susymadrid75@gmail.com)

-- ---------------------------------------------------------------------------
-- STEP 0: Pre-flight snapshot (read-only within transaction)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_stage1 uuid := '8354b6d2-0c6c-4a95-a16d-3bbb6908c943';
  v_madrid uuid := 'd38fec7b-adac-4b7f-a46d-2ccadab6e452';
  v_jms uuid := 'ebb368d8-248d-4986-8fdd-56a4da7a33d8';
  v_susy uuid := '6785ddd8-d0a7-4afd-a97e-1ad9f8e377a4';
  v_madrid_clients int;
  v_jms_clients int;
BEGIN
  SELECT count(*) INTO v_madrid_clients FROM public.clients WHERE tenant_id = v_madrid;
  SELECT count(*) INTO v_jms_clients FROM public.clients WHERE tenant_id = v_jms;

  IF v_madrid_clients <> 64 THEN
    RAISE EXCEPTION 'Pre-flight failed: Madrid clients expected 64, got %', v_madrid_clients;
  END IF;
  IF v_jms_clients <> 1 THEN
    RAISE EXCEPTION 'Pre-flight failed: JMS clients expected 1, got %', v_jms_clients;
  END IF;

  RAISE NOTICE 'Pre-flight OK — Madrid=%, JMS=%, Stage1 tenant=%',
    v_madrid_clients, v_jms_clients, v_stage1;
END $$;

-- Pre-delete counts (Owner Command Center core + extended)
SELECT 'PRE_DELETE' AS phase, 'clients' AS tbl, count(*) AS cnt
FROM public.clients WHERE tenant_id = '8354b6d2-0c6c-4a95-a16d-3bbb6908c943'
UNION ALL SELECT 'PRE_DELETE', 'jobs', count(*) FROM public.jobs
  WHERE tenant_id = '8354b6d2-0c6c-4a95-a16d-3bbb6908c943'
UNION ALL SELECT 'PRE_DELETE', 'estimates', count(*) FROM public.estimates
  WHERE tenant_id = '8354b6d2-0c6c-4a95-a16d-3bbb6908c943'
UNION ALL SELECT 'PRE_DELETE', 'invoices', count(*) FROM public.invoices
  WHERE tenant_id = '8354b6d2-0c6c-4a95-a16d-3bbb6908c943'
UNION ALL SELECT 'PRE_DELETE', 'payments', count(*) FROM public.payments
  WHERE tenant_id = '8354b6d2-0c6c-4a95-a16d-3bbb6908c943'
UNION ALL SELECT 'PRE_DELETE', 'contracts', count(*) FROM public.contracts
  WHERE tenant_id = '8354b6d2-0c6c-4a95-a16d-3bbb6908c943'
ORDER BY tbl;

-- Global pre-delete totals (platform-wide)
SELECT 'PRE_DELETE_GLOBAL' AS phase, 'clients' AS tbl, count(*) AS cnt FROM public.clients
UNION ALL SELECT 'PRE_DELETE_GLOBAL', 'jobs', count(*) FROM public.jobs
UNION ALL SELECT 'PRE_DELETE_GLOBAL', 'estimates', count(*) FROM public.estimates
UNION ALL SELECT 'PRE_DELETE_GLOBAL', 'invoices', count(*) FROM public.invoices
UNION ALL SELECT 'PRE_DELETE_GLOBAL', 'payments', count(*) FROM public.payments
UNION ALL SELECT 'PRE_DELETE_GLOBAL', 'contracts', count(*) FROM public.contracts
ORDER BY tbl;

-- ---------------------------------------------------------------------------
-- STEP 1: Deletes — children first, FK-safe order
-- ALL statements scoped to tenant_id = 8354b6d2-0c6c-4a95-a16d-3bbb6908c943
-- (or subqueries derived solely from that tenant)
-- ---------------------------------------------------------------------------

-- Bill payments chain
DELETE FROM public.bill_payment_remittance_queue
WHERE bill_id IN (
  SELECT id FROM public.bills
  WHERE tenant_id = '8354b6d2-0c6c-4a95-a16d-3bbb6908c943'
);

DELETE FROM public.bill_payment_transactions
WHERE tenant_id = '8354b6d2-0c6c-4a95-a16d-3bbb6908c943';

DELETE FROM public.bills
WHERE tenant_id = '8354b6d2-0c6c-4a95-a16d-3bbb6908c943';

DELETE FROM public.bill_payment_methods
WHERE tenant_id = '8354b6d2-0c6c-4a95-a16d-3bbb6908c943';

DELETE FROM public.bill_payment_customers
WHERE tenant_id = '8354b6d2-0c6c-4a95-a16d-3bbb6908c943';

-- Stripe invoice payments (explicit; also cascades from invoices)
DELETE FROM public.payments
WHERE tenant_id = '8354b6d2-0c6c-4a95-a16d-3bbb6908c943';

-- Job-attached children (no tenant_id column on job_files)
DELETE FROM public.job_files
WHERE job_id IN (
  SELECT id FROM public.jobs
  WHERE tenant_id = '8354b6d2-0c6c-4a95-a16d-3bbb6908c943'
);

DELETE FROM public.job_expenses
WHERE tenant_id = '8354b6d2-0c6c-4a95-a16d-3bbb6908c943';

DELETE FROM public.job_cost_entries
WHERE tenant_id = '8354b6d2-0c6c-4a95-a16d-3bbb6908c943';

DELETE FROM public.job_cost_summaries
WHERE tenant_id = '8354b6d2-0c6c-4a95-a16d-3bbb6908c943';

DELETE FROM public.job_labor_entries
WHERE tenant_id = '8354b6d2-0c6c-4a95-a16d-3bbb6908c943';

DELETE FROM public.notifications
WHERE tenant_id = '8354b6d2-0c6c-4a95-a16d-3bbb6908c943';

DELETE FROM public.appointments
WHERE tenant_id = '8354b6d2-0c6c-4a95-a16d-3bbb6908c943';

-- Core CRM entities
DELETE FROM public.invoices
WHERE tenant_id = '8354b6d2-0c6c-4a95-a16d-3bbb6908c943';

DELETE FROM public.jobs
WHERE tenant_id = '8354b6d2-0c6c-4a95-a16d-3bbb6908c943';

DELETE FROM public.estimates
WHERE tenant_id = '8354b6d2-0c6c-4a95-a16d-3bbb6908c943';

DELETE FROM public.contracts
WHERE tenant_id = '8354b6d2-0c6c-4a95-a16d-3bbb6908c943';

DELETE FROM public.quotes
WHERE tenant_id = '8354b6d2-0c6c-4a95-a16d-3bbb6908c943';

DELETE FROM public.estimate_builder
WHERE tenant_id = '8354b6d2-0c6c-4a95-a16d-3bbb6908c943';

-- Website / leads
DELETE FROM public.contractor_website_leads
WHERE tenant_id = '8354b6d2-0c6c-4a95-a16d-3bbb6908c943';

DELETE FROM public.website_media
WHERE website_id IN (
  SELECT id FROM public.contractor_websites
  WHERE tenant_id = '8354b6d2-0c6c-4a95-a16d-3bbb6908c943'
);

DELETE FROM public.contractor_websites
WHERE tenant_id = '8354b6d2-0c6c-4a95-a16d-3bbb6908c943';

DELETE FROM public.vendors
WHERE tenant_id = '8354b6d2-0c6c-4a95-a16d-3bbb6908c943';

-- Clients last among CRM (client_* children cascade if present)
DELETE FROM public.clients
WHERE tenant_id = '8354b6d2-0c6c-4a95-a16d-3bbb6908c943';

-- NOT deleted in Stage 1 (preserve Auth / compliance):
--   auth.users, public.profiles, public.company_profiles (empty row kept)
--   public.audit_logs (72 rows) — optional Stage 1b purge

-- ---------------------------------------------------------------------------
-- STEP 2: Post-delete verification (within same transaction)
-- ---------------------------------------------------------------------------

-- Stage 1 tenant must be empty for core CRM
SELECT 'POST_DELETE_STAGE1' AS phase, 'clients' AS tbl, count(*) AS cnt
FROM public.clients WHERE tenant_id = '8354b6d2-0c6c-4a95-a16d-3bbb6908c943'
UNION ALL SELECT 'POST_DELETE_STAGE1', 'jobs', count(*) FROM public.jobs
  WHERE tenant_id = '8354b6d2-0c6c-4a95-a16d-3bbb6908c943'
UNION ALL SELECT 'POST_DELETE_STAGE1', 'estimates', count(*) FROM public.estimates
  WHERE tenant_id = '8354b6d2-0c6c-4a95-a16d-3bbb6908c943'
UNION ALL SELECT 'POST_DELETE_STAGE1', 'invoices', count(*) FROM public.invoices
  WHERE tenant_id = '8354b6d2-0c6c-4a95-a16d-3bbb6908c943'
UNION ALL SELECT 'POST_DELETE_STAGE1', 'payments', count(*) FROM public.payments
  WHERE tenant_id = '8354b6d2-0c6c-4a95-a16d-3bbb6908c943'
UNION ALL SELECT 'POST_DELETE_STAGE1', 'contracts', count(*) FROM public.contracts
  WHERE tenant_id = '8354b6d2-0c6c-4a95-a16d-3bbb6908c943'
ORDER BY tbl;

-- Global post-delete totals (expected after Stage 1)
SELECT 'POST_DELETE_GLOBAL' AS phase, 'clients' AS tbl, count(*) AS cnt FROM public.clients
UNION ALL SELECT 'POST_DELETE_GLOBAL', 'jobs', count(*) FROM public.jobs
UNION ALL SELECT 'POST_DELETE_GLOBAL', 'estimates', count(*) FROM public.estimates
UNION ALL SELECT 'POST_DELETE_GLOBAL', 'invoices', count(*) FROM public.invoices
UNION ALL SELECT 'POST_DELETE_GLOBAL', 'payments', count(*) FROM public.payments
UNION ALL SELECT 'POST_DELETE_GLOBAL', 'contracts', count(*) FROM public.contracts
ORDER BY tbl;

-- Real tenant protection verification (MUST match pre-cleanup values)
SELECT 'REAL_PROTECT' AS phase, tenant_id, 'clients' AS metric, count(*) AS cnt
FROM public.clients
WHERE tenant_id IN (
  'd38fec7b-adac-4b7f-a46d-2ccadab6e452',
  'ebb368d8-248d-4986-8fdd-56a4da7a33d8',
  '6785ddd8-d0a7-4afd-a97e-1ad9f8e377a4'
)
GROUP BY tenant_id
UNION ALL
SELECT 'REAL_PROTECT', tenant_id, 'invoices', count(*)
FROM public.invoices
WHERE tenant_id IN (
  'd38fec7b-adac-4b7f-a46d-2ccadab6e452',
  'ebb368d8-248d-4986-8fdd-56a4da7a33d8',
  '6785ddd8-d0a7-4afd-a97e-1ad9f8e377a4'
)
GROUP BY tenant_id
ORDER BY tenant_id, metric;

-- ---------------------------------------------------------------------------
-- STEP 3: Rollback (default — DRY RUN)
-- Replace ROLLBACK with COMMIT only after manual approval
-- ---------------------------------------------------------------------------
ROLLBACK;
-- COMMIT;
