# FieldBase Production Bug List

**Audit date:** June 2026  
**Status:** Pre-launch stabilization complete. **Controlled production testing** is active — log new findings in **[CONTROLLED-PRODUCTION-LOG.md](./CONTROLLED-PRODUCTION-LOG.md)** only (bug-fix scope, no new features).

## Fixed in this pass

| ID | Severity | Module | Issue | Fix |
|----|----------|--------|-------|-----|
| P0-1 | Critical | Executive P&L | `listProjectPlSummaries` N+1 (~300 queries/dashboard) | `listJobProfitRollups()` uses job rollup columns |
| P0-2 | Critical | Executive P&L | Loaded all tenant invoices | Scoped queries + id dedupe by month/AR |
| P0-3 | Critical | Payroll | `RUN_ITEMS` missing `tenant_id` filter | Added on run detail API + `payroll-service` |
| P1-1 | High | Payroll UI | Double `response.json()` on jobs in pay run detail | Single parse of `jobsPayload` |
| P1-2 | High | Dashboard | Duplicate Stripe connect status fetch | `PaymentsReadinessBanner` accepts parent `connectStatus` |
| P1-3 | High | Invoices | Double fetch on `?payment=success` | Merged payment + mount `useEffect` |
| P1-4 | High | Invoices | Broken JSX after empty-state edit | Restored `))}` on list map |
| P1-5 | High | Payroll | GET reminders `?sync=1` wrote on read | Read-only GET; `POST /api/payroll/reminders/sync` |
| P2-1 | Medium | UX | Jobs/invoices wrong empty copy when list empty | Branch on `listSearch` vs zero data |
| P2-2 | Medium | UX | Payroll runs blank table | Empty row with CTA copy |
| P2-3 | Medium | UX | Payroll calendar silent failures | Error state + message |
| P2-4 | Medium | Mobile | No breakpoints on jobs/invoices/payroll/clients | `@media (max-width: 760px)` blocks |
| P2-5 | Medium | Mobile | Job card meta overflow | `word-break` on `.jobCardMeta` |
| P2-6 | Medium | Validation | Jobs save without title/client | `requireNonEmptyString` client-side |
| P2-7 | Medium | Validation | Invoices save without client/amount | Client + `isPositiveMoney` |
| P2-8 | Medium | Validation | Clients email/phone | `validateContactFields` |
| P2-9 | Medium | Equipment | Empty name accepted | Server + client validation |
| P3-1 | Low | AI | (prior pass) High-impact tools need confirm | `ai-tool-guard` + audit logs |
| P3-2 | Medium | Jobs UI | Per-row P&L called full `/financial` when expanded | `/api/jobs/:id/pl-summary` + rollup columns |
| P3-3 | Low | Places API | Session-only auth vs full tenant context | `getAuthenticatedTenantContext` on autocomplete/details |
| P3-4 | Low | Estimates | Kanban horizontal-only on mobile | Stack columns under 768px |
| P3-5 | Low | Payroll reports | Auto-run on every filter change | Explicit Run button only |
| P3-6 | Low | Calendar | All appointments loaded | Month-scoped `?from=&to=` on GET |
| P3-7 | Low | Calendar | No drag reschedule | HTML5 drag between day cells |
| P3-8 | Low | Monitoring | No client error pipeline | `ClientErrorReporter` → `audit_logs` |
| P3-9 | Low | Addresses | Jobs/payroll manual street entry | Places on job site + `AddressFieldsGroup` for employees |

## Open / deferred (not blocking MVP)

| ID | Severity | Module | Issue | Recommendation |
|----|----------|--------|-------|----------------|
| O-1 | Medium | Infra | In-memory API caches not shared across instances | Redis/Upstash or DB rollups |
| O-3 | Medium | Bill pay | Pages exist but middleware redirects contractors | Product decision: remove or re-enable |
| O-5 | Low | Estimates | Some hardcoded EN loading strings | i18n keys |
| O-7 | Low | Receipts | OCR is text-parse stub | Real OCR provider later |
| O-8 | Low | UX | Button class fragmentation across modules | Prefer `workspace-dark.module.css` tokens module-by-module |
| O-10 | Low | E2E | Some audit specs flaky under parallel load (clients, contracts, payroll API timeout) | Run critical subset in CI; investigate timeouts |

See **`docs/LAUNCH-READINESS-REPORT.md`** for full pre-launch sign-off.

## Verification (recommended CI subset)

```bash
node --test tests/unit/*.test.mjs
npx playwright test tests/e2e/audit/production-readiness.spec.js tests/e2e/audit/contractor-financial.spec.js tests/e2e/audit/contractor-workflows.spec.js tests/e2e/audit/payroll-module.spec.js tests/e2e/audit/dashboard-module.spec.js
```

Manual: `docs/QA-CHECKLIST.md`

## Module sign-off checklist

- [x] CRM — clients validation, mobile CSS
- [x] Estimates — kanban mobile stack, Places on new estimate
- [x] Jobs — validation, empty states, mobile, P&L rollup perf
- [x] Schedule — calendar drag-drop, scoped load, Places on appointments
- [x] Invoices — validation, fetch fix, mobile CSS
- [x] Payments — dashboard single connect fetch
- [x] Expenses — equipment + job expenses (prior pass)
- [x] Payroll — tenant scope, UI bugs, reminders GET
- [x] Reports — `/reports` hub
- [x] AI — confirm + audit (prior pass)
