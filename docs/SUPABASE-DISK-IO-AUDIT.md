# Supabase Disk IO Audit & Optimization Report

**Date:** June 2026  
**Trigger:** Supabase Disk IO budget depletion — slow production UI on fieldbaseapp.net  
**Scope:** Full integration audit + safe optimizations implemented in-repo

---

## Executive summary

FieldBase uses **server-side only** Supabase access (`supabaseAdmin`). There are **no Realtime subscriptions** and **no client-side Postgres queries**. IO pressure comes from:

1. **High query count per page load** (especially Dashboard)
2. **Unpaginated full-table reads** (jobs, invoices, estimates)
3. **N+1 client lookups** (invoices, estimates)
4. **Repeated COUNT queries** instead of aggregates
5. **Short API caches** causing frequent cold hits
6. **Owner admin polling** (30s) with large audit log reads

**Safe optimizations were implemented** (see §8). **Apply migration** `20260614120000_disk_io_performance_indexes.sql` on production Supabase immediately.

---

## 1. Tables with highest read/write volume (estimated)

| Rank | Table | Read drivers | Write drivers |
|------|-------|--------------|---------------|
| 1 | **invoices** | Dashboard metrics (13× COUNT), executive P&L (3–4 SELECTs), unpaginated GET, summary route | Create/update invoice, payments |
| 2 | **jobs** | Dashboard metrics, jobs list GET, job rollups, executive pipeline (was full scan) | Job CRUD, costing rollups |
| 3 | **clients** | Dashboard funnel counts, client list, N+1 hydrate on invoices/estimates | CRM CRUD |
| 4 | **payroll_expense_records** | Executive P&L month range, job PL | Payroll finalize |
| 5 | **appointments** | Calendar (month range or full list) | Schedule CRUD |
| 6 | **estimates** | Kanban list (full tenant + enrich) | Estimate CRUD |
| 7 | **audit_logs** | Owner usage dashboard (up to 10k rows, 30s poll) | Client errors, AI, security |
| 8 | **job_expenses** | Executive P&L, per-job financial | Expense CRUD |
| 9 | **company_profiles** | Workspace context (1× per session) | Settings updates |
| 10 | **contractor_website_leads** | Dashboard new lead count | Lead inbox |

---

## 2. Pages / routes generating the most DB traffic

| Page / route | Queries (typical cold load) | Severity |
|--------------|----------------------------|----------|
| **`/dashboard`** | 17+ via `/api/dashboard-metrics` + revenue RPC + connect status | **Critical** |
| **`/dashboard/financial`** | 6–8 via executive dashboard (was + ALL jobs rows) | **Critical** |
| **`/jobs`** | 1× full jobs SELECT (was unbounded) | **High** |
| **`/invoices`** | 1× full invoices + N client lookups (was N+1) | **High** |
| **`/estimates`** | 1× full estimates + N client lookups (was N+1) | **High** |
| **`/calendar`** | Appointments in range + weather (external API, not Supabase) | **Medium** |
| **`/invoices/summary`** | Full tenant invoice scan | **High** |
| **`/owner/usage`** | 12+ counts + 10k audit_logs every 30s | **High** (super_admin only) |
| **`/payroll/*`** | 5 bounded queries per dashboard load | **Low–Medium** |
| Navigation prefetch | Indirect — loads RSC; DB hits on destination page | **Medium** |

---

## 3. Missing indexes (added in migration)

Migration: `supabase/migrations/20260614120000_disk_io_performance_indexes.sql`

| Index | Supports |
|-------|----------|
| `idx_jobs_tenant_updated` | `listJobProfitRollups`, recent jobs |
| `idx_jobs_tenant_invoiced_status` | Completed uninvoiced count |
| `idx_invoices_tenant_balance_due` | AR / open balance queries |
| `idx_invoices_tenant_stripe_paid_at` | Month revenue by payment date |
| `idx_invoices_tenant_updated` | Paid-by-update month query |
| `idx_clients_tenant_lead_status` | Dashboard funnel counts |
| `idx_clients_tenant_estimate_sent` | Estimates-sent count |
| `idx_job_expenses_tenant_expense_date` | Month expense rollup |
| `idx_payroll_expense_records_tenant_period` | Payroll P&L month |
| `idx_estimates_tenant_updated` | Estimates kanban sort |

Existing indexes from `20260501100000_add_composite_performance_indexes.sql` remain in use.

---

## 4. Queries optimized (this pass)

| Area | Before | After |
|------|--------|-------|
| Executive dashboard jobs pipeline | `SELECT *` all jobs | 4× `COUNT` head queries |
| Executive dashboard invoices | Unbounded | `.limit(500)` per query |
| Dashboard metrics pending invoice | Scan 500 job rows | `COUNT` with status + invoiced filter |
| Dashboard metrics outstanding | Scan 500 all invoices | Rows with `balance_due > 0` only, cap 200 |
| Dashboard metrics revenue | 500 job rows | 150 job price rows (cap) |
| `listProjectPlSummaries` | N× `getJobProjectPl` | Single rollup query (prior fix) |
| Invoice list hydrate | 1 query per invoice | 1 batch `IN (client_ids)` + rare name fallback |
| Estimates list enrich | 1 query per estimate | 1 batch client load + name fallback |
| Payroll PL summary | `select *` | `select gross_amount, employer_tax_amount, labor_burden` |
| Jobs/invoices/appointments GET | Unbounded | Cap 250–400 when unpaginated |
| Estimates GET | Unbounded | `.limit(250)` |
| Invoice summary API | Full table | `.limit(500)` + 90s cache |

---

## 5. Caching opportunities (implemented / recommended)

| Layer | Status | TTL |
|-------|--------|-----|
| `/api/dashboard-metrics` | **Implemented** ↑ | 120s (was 45s) |
| `/api/dashboard/financial` | **Implemented** ↑ | 120s (was 60s) |
| `/api/invoices/summary` | **Implemented** | 90s |
| Website publish status (client) | Prior pass | 5m sessionStorage |
| Revenue dashboard RPC | Existing | Server-side |
| **Recommended:** Redis/Upstash shared cache | Not implemented | Cross-instance (O-1) |
| **Recommended:** Materialized rollups for dashboard | Not implemented | Nightly job |

---

## 6. Lazy loading opportunities

| Module | Recommendation |
|--------|----------------|
| Jobs list P&L panel | Already uses `/pl-summary` on expand only ✓ |
| Job financial dashboard | Load on `/jobs/[id]/financial` only ✓ |
| Estimates kanban columns | Load column data on scroll (future) |
| Invoice party hydrate | Skip when addresses already on row ✓ |
| Calendar weather | Throttled queue (prior LIVE-001) ✓ |
| Executive losing jobs | Top 10 only ✓ |

---

## 7. Pagination opportunities (implemented)

| Endpoint | Change |
|----------|--------|
| `GET /api/jobs` | Default cap **250** via `applyUnpaginatedSafetyLimit` |
| `GET /api/invoices` | Default cap **250** |
| `GET /api/appointments` | Default cap **400** (or use `?from=&to=` from calendar) |
| `GET /api/estimates` | Hard cap **250** |
| Jobs page UI | `?limit=250&page=1` |
| Invoices page UI | `?limit=250&page=1` |
| Clients page | Already paginated ✓ |

Set `CRM_DEFAULT_LIST_LIMIT=100` in Vercel env to enforce server-side pagination by default.

---

## 8. Other findings

### No issues found
- Realtime subscriptions — **none**
- Supabase client queries in browser — **none** (REST API only)

### Polling (reduced)
- `OwnerUsageDashboard`: **30s → 120s**
- Owner login activity: 60s (unchanged; super_admin only)

### N+1 (fixed this pass)
- `hydrateInvoiceDocsParty` — batch client load
- `enrichEstimatesWithPartyBatch` — batch client load

### Remaining deferred (higher risk / larger scope)
- Replace dashboard-metrics 13 COUNTs with **single SQL RPC** aggregate
- Owner usage: reduce audit_logs fetch from 10k
- Estimates `notes ILIKE '%uuid%'` client-details search — needs schema link column
- Distributed cache (Redis) for multi-instance Vercel

---

## 9. Implementation summary (this commit)

| File | Change |
|------|--------|
| `supabase/migrations/20260614120000_disk_io_performance_indexes.sql` | **New indexes** |
| `src/lib/tenant-scope.js` | Unpaginated safety cap helper |
| `src/lib/executive-dashboard.js` | COUNT pipeline, invoice limits |
| `src/app/api/dashboard-metrics/route.js` | Fewer row scans, 120s cache |
| `src/app/api/dashboard/financial/route.js` | 120s cache |
| `src/lib/invoice-party.js` | Batch hydrate |
| `src/lib/client-document-party.js` | Batch estimate enrich |
| `src/app/api/jobs/route.js` | Safety limit |
| `src/app/api/invoices/route.js` | Safety limit |
| `src/app/api/appointments/route.js` | Safety limit |
| `src/app/api/estimates/route.js` | Limit 250 + batch enrich |
| `src/app/api/invoices/summary/route.js` | Limit 500 + cache |
| `src/lib/payroll-accounting.js` | Narrow SELECT |
| `src/app/jobs/page.js` | Paginated fetch |
| `src/app/invoices/page.js` | Paginated fetch |
| `src/components/owner/OwnerUsageDashboard.jsx` | 120s poll interval |

---

## 10. Production deployment checklist

1. **Merge & deploy** application code (PR branch)
2. **Run migration** on production Supabase:
   ```bash
   npx supabase db push
   ```
   Or paste `20260614120000_disk_io_performance_indexes.sql` in SQL editor
3. Optional env: `CRM_DEFAULT_LIST_LIMIT=100`
4. Monitor Supabase **Database → Reports → Disk IO** for 24–48h
5. Log follow-up in `docs/CONTROLLED-PRODUCTION-LOG.md` as **LIVE-002**

---

## 11. Expected impact

- **Dashboard load:** ~40% fewer row reads; ~2.5× longer cache → ~60% fewer cold hits during active use
- **Jobs/invoices navigation:** Bounded to 250 rows vs full table
- **Estimates/invoices lists:** N+1 eliminated for rows with `client_id`
- **Executive P&L:** Removes largest full-table job scan
- **Indexes:** Faster COUNT and filtered SELECT on hot paths

Disk IO should stabilize within 24h of deploy + migration. If budget still drains, next step is **dashboard-metrics RPC consolidation** (single query).
