# FieldBase Launch Readiness Report

**Tenant:** Madrid Landscaping  
**Date:** June 4, 2026  
**Scope:** Pre-launch stabilization (no new modules)

## Executive summary

FieldBase is **ready for controlled daily use** by Madrid Landscaping. Core workflows (CRM, estimates, jobs, scheduling, payroll, invoices, expenses, reports) are wired, tenant-scoped, and covered by automated smoke tests. This pass focused on address autocomplete, list-view performance, calendar UX, client error logging, and documented open items for post-launch.

## Launch criteria status

| Area | Status | Notes |
|------|--------|-------|
| Google Places (addresses) | **Ready** | Clients, estimates, calendar appointments, jobs (job site), payroll employees; invoices use client billing address |
| Performance (critical paths) | **Improved** | Jobs list P&L uses `/pl-summary`; calendar loads month-scoped appointments; executive P&L uses rollups (prior pass) |
| Bug registry (P0–P2) | **Closed** | See `docs/PRODUCTION-BUGS.md` |
| Mobile UX | **Improved** | Breakpoints on major modules; estimates kanban stacks on mobile |
| Calendar | **Improved** | Drag-and-drop reschedule; scoped fetch; weather bootstrap loop fixed |
| Monitoring | **Added** | `ClientErrorReporter` → `POST /api/client-errors` → `audit_logs` |
| Security / permissions | **Verified** | Tenant context on Places API; payroll run items scoped; mutation guards on writes |
| E2E / QA | **Partial** | CI subset documented; full device matrix requires manual sign-off |

## Module validation

| Module | Automated | Manual (recommended) |
|--------|-----------|----------------------|
| CRM (clients) | production-readiness, clients audit | iPhone/Android: create client, Places address, search |
| Estimates | estimates-module, contractor-workflows | Send quote, convert to job, kanban on phone |
| Contracts | contractor-workflows | Sign flow, PDF |
| Jobs | contractor-workflows, financial | Create job, job site Places, expand P&L, files |
| Scheduling | calendar in app | Drag appointment to new day, create with Places |
| Payroll | payroll-module | Employee address Places, run payroll, reports (Run button) |
| Invoices | production-readiness | Create from client, Stripe payment if enabled |
| Expenses / equipment | contractor-financial | Job expense + receipt upload |
| Reports | dashboard-module, `/reports` hub | Business P&L, financial dashboard |

## Remaining bugs

| ID | Severity | Issue | Impact |
|----|----------|-------|--------|
| O-1 | Medium | In-memory API caches not shared across server instances | Stale metrics up to cache TTL under multi-instance deploy |
| O-3 | Medium | Bill-pay routes disabled in middleware | Contractors cannot use bill-pay until product re-enables |
| O-7 | Low | Receipt OCR is text-parse stub | Manual entry still required for messy receipts |
| O-10 | Low | Some E2E specs flaky under parallel CI | Use documented CI subset; investigate clients/contracts timeouts |

**Fixed this pass:** O-2 (jobs list P&L), O-4 (estimates kanban mobile), O-5 (partial — jobs panel uses i18n loading), O-6 (Places tenant auth), O-8 (documented shared tokens in `workspace-dark.module.css`), O-9 (payroll reports explicit Run only).

## Performance notes

| Surface | Before | After |
|---------|--------|-------|
| Jobs list — expand P&L | Full `/api/jobs/:id/financial` | `/api/jobs/:id/pl-summary` (rollup columns) |
| Calendar | All appointments | Month window ±1 month via `?from=&to=` |
| Executive / Business P&L | N+1 job PL (prior fix) | `listJobProfitRollups` |
| Dashboard | Parallel fetches + timeout | Unchanged; 12s abort, metrics cache ~45s |

**Future:** Redis/Upstash for shared cache (O-1); server-side calendar aggregates if appointment volume grows.

## Security concerns

| Item | Risk | Mitigation |
|------|------|------------|
| Places API key | Server-only proxy | Key never sent to browser; tenant auth required |
| Client error logging | PII in stack traces | Truncated message/stack; tenant-scoped audit row |
| Payroll / jobs APIs | Cross-tenant read | `scopeByTenant` + `tenant_id` on run items |
| Bill pay (disabled) | Confusion | Routes redirect; no accidental exposure |
| AI high-impact tools | Destructive actions | Confirm + audit (prior pass) |

**Recommended:** Periodic review of `audit_logs` for `client.error` and `ai.tool.*`; enable Stripe webhooks monitoring in production.

## Recommended future enhancements (post-launch)

1. **Shared UI kit** — Single import for `btnPrimary`, `loadingBlock`, modals across all modules (O-8 completion).
2. **Real receipt OCR** — Google Vision or similar (O-7).
3. **Bill pay** — Product decision to re-enable or remove nav entries (O-3).
4. **Distributed cache** — Upstash for dashboard/financial routes (O-1).
5. **Calendar** — Time-of-day drag, crew assignment lanes, conflict detection.
6. **Invoices** — Optional ship-to Places when billing address differs from client default.
7. **Native mobile** — PWA install prompts, offline job notes (if needed in field).

## Test commands

```bash
node --test tests/unit/*.test.mjs
npx playwright test tests/e2e/audit/production-readiness.spec.js tests/e2e/audit/contractor-financial.spec.js tests/e2e/audit/contractor-workflows.spec.js tests/e2e/audit/payroll-module.spec.js tests/e2e/audit/dashboard-module.spec.js tests/e2e/audit/estimates-module.spec.js
```

Manual checklist: `docs/QA-CHECKLIST.md`

## Sign-off

| Role | Action |
|------|--------|
| Engineering | Run CI subset above on `main` before deploy |
| Madrid Landscaping | 2–3 days parallel use: dashboard → job → invoice → payroll |
| Owner | Confirm Stripe connect + legal acceptance in production tenant |

---

*Generated as part of the final pre-launch stabilization pass. Do not add new modules until Madrid Landscaping completes a stable production week.*
