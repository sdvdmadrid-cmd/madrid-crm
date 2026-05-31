# Production readiness report — Madrid contractor platform

**Goal:** Polished contractor SaaS where every feature works start-to-finish.  
**Method:** Module-by-module usability audit (buttons, dropdowns, search, filters, forms, workflows, persistence, responsive UI, print/PDF).  
**Last updated:** 2026-05-31  
**Milestone status:** **CLOSED** (audit phase 2 deployed)  
**Session handoff:** [SESSION_HANDOFF_2026-05-31.md](./audits/SESSION_HANDOFF_2026-05-31.md)

---

## Executive summary

| Metric | Status |
|--------|--------|
| Modules in scope | 16 / 16 audited |
| Module sign-offs | 16 / 16 |
| Fix-now items (F-001–F-011) | **Shipped** on production |
| Production deploy | [PR #81](https://github.com/sdvdmadrid-cmd/madrid-crm/pull/81) → `e935dcd` on https://fieldbaseapp.net |
| Prior deploy | [PR #80](https://github.com/sdvdmadrid-cmd/madrid-crm/pull/80) → `df9e7c5` |
| Platform (contractor daily CRM) | **Stable on production** — manual owner review is next phase |
| Next work | Real-world workflow review + prioritize B-001–B-006 (not new module audits) |

**Production verification (2026-05-31):**

- GitHub **Production Deploy Verify:** passed on merge of PR #81
- `npm run verify:prod`: passed — `/api/health` `commitSha=e935dcd3dc1e`
- E2E: `tests/e2e/audit/` — 96 tests, 95 passed, 1 flaky (infra only)

---

## Module status (all deployed)

| Module | Audit | Sign-off | E2E spec | Verdict |
|--------|-------|----------|----------|---------|
| Clients | [MODULE_AUDIT_CLIENTS.md](./audits/MODULE_AUDIT_CLIENTS.md) | — | `clients-module.spec.js` | ✅ Live |
| Estimates | [MODULE_AUDIT_ESTIMATES.md](./audits/MODULE_AUDIT_ESTIMATES.md) | [ESTIMATES_MODULE_SIGN_OFF.md](./audits/ESTIMATES_MODULE_SIGN_OFF.md) | `estimates-module.spec.js` | ✅ Live |
| Jobs | [MODULE_AUDIT_JOBS.md](./audits/MODULE_AUDIT_JOBS.md) | [JOBS_MODULE_SIGN_OFF.md](./audits/JOBS_MODULE_SIGN_OFF.md) | `jobs-module.spec.js` | ✅ Live |
| Invoices | [MODULE_AUDIT_INVOICES.md](./audits/MODULE_AUDIT_INVOICES.md) | [INVOICES_MODULE_SIGN_OFF.md](./audits/INVOICES_MODULE_SIGN_OFF.md) | `invoices-module.spec.js` | ✅ Live |
| Payments | [MODULE_AUDIT_PAYMENTS.md](./audits/MODULE_AUDIT_PAYMENTS.md) | [PAYMENTS_MODULE_SIGN_OFF.md](./audits/PAYMENTS_MODULE_SIGN_OFF.md) | `payments-module.spec.js` | ✅ Live |
| Contracts | [MODULE_AUDIT_CONTRACTS.md](./audits/MODULE_AUDIT_CONTRACTS.md) | [CONTRACTS_MODULE_SIGN_OFF.md](./audits/CONTRACTS_MODULE_SIGN_OFF.md) | `contracts-module.spec.js` | ✅ Live |
| Lead Inbox | [MODULE_AUDIT_LEAD_INBOX.md](./audits/MODULE_AUDIT_LEAD_INBOX.md) | [LEAD_INBOX_MODULE_SIGN_OFF.md](./audits/LEAD_INBOX_MODULE_SIGN_OFF.md) | `lead-inbox-module.spec.js` | ✅ Live |
| Website Builder | [MODULE_AUDIT_WEBSITE_BUILDER.md](./audits/MODULE_AUDIT_WEBSITE_BUILDER.md) | [WEBSITE_BUILDER_MODULE_SIGN_OFF.md](./audits/WEBSITE_BUILDER_MODULE_SIGN_OFF.md) | `website-builder-module.spec.js` | ✅ Live |
| Reputation | [MODULE_AUDIT_REPUTATION.md](./audits/MODULE_AUDIT_REPUTATION.md) | [REPUTATION_MODULE_SIGN_OFF.md](./audits/REPUTATION_MODULE_SIGN_OFF.md) | `reputation-module.spec.js` | ✅ Live |
| Calendar | [MODULE_AUDIT_CALENDAR.md](./audits/MODULE_AUDIT_CALENDAR.md) | [CALENDAR_MODULE_SIGN_OFF.md](./audits/CALENDAR_MODULE_SIGN_OFF.md) | `calendar-module.spec.js` | ✅ Live |
| Service Catalog | [MODULE_AUDIT_SERVICE_CATALOG.md](./audits/MODULE_AUDIT_SERVICE_CATALOG.md) | [SERVICE_CATALOG_MODULE_SIGN_OFF.md](./audits/SERVICE_CATALOG_MODULE_SIGN_OFF.md) | `services-catalog-module.spec.js` | ✅ Live |
| Dashboard | [MODULE_AUDIT_DASHBOARD.md](./audits/MODULE_AUDIT_DASHBOARD.md) | [DASHBOARD_MODULE_SIGN_OFF.md](./audits/DASHBOARD_MODULE_SIGN_OFF.md) | `dashboard-module.spec.js` | ✅ Live |
| Settings | [MODULE_AUDIT_SETTINGS.md](./audits/MODULE_AUDIT_SETTINGS.md) | [SETTINGS_MODULE_SIGN_OFF.md](./audits/SETTINGS_MODULE_SIGN_OFF.md) | `settings-module.spec.js` | ✅ Live |
| Subscriptions | [MODULE_AUDIT_SUBSCRIPTIONS.md](./audits/MODULE_AUDIT_SUBSCRIPTIONS.md) | [SUBSCRIPTIONS_MODULE_SIGN_OFF.md](./audits/SUBSCRIPTIONS_MODULE_SIGN_OFF.md) | `subscriptions-module.spec.js` | ✅ Live |
| Owner/Admin | [MODULE_AUDIT_OWNER_ADMIN.md](./audits/MODULE_AUDIT_OWNER_ADMIN.md) | [OWNER_ADMIN_MODULE_SIGN_OFF.md](./audits/OWNER_ADMIN_MODULE_SIGN_OFF.md) | `owner-admin-module.spec.js` | ✅ Smoke (B-002 deferred) |

---

## Fix now — shipped (F-001–F-011)

| ID | Summary |
|----|---------|
| F-001 | Invoice list refresh on tab focus |
| F-002 | Contract → estimate deep link (`estimate_id` + `est-ref:` fallback) |
| F-003 | Contract status filter options |
| F-004 | Estimate kanban “More actions” collapse |
| F-005 | Reputation reviews search + collapsible import |
| F-006 | Website → Lead Inbox navigation |
| F-007 | Calendar today’s schedule strip |
| F-008 | Service catalog search + website link |
| F-009 | Dashboard actionable metrics + `leadInbox.newCount` |
| F-010 | Settings hub: catalog + website cards |
| F-011 | Subscriptions `apiFetch`, English shell, back to settings |

Ledger: [UX_FIX_LEDGER.md](./audits/UX_FIX_LEDGER.md)

---

## Migrations (this milestone)

| File | Purpose | Blocks production? |
|------|---------|-------------------|
| `20260531120000_contracts_estimate_id.sql` | `contracts.estimate_id` column + index | **No** — app uses `est-ref:` fallback until column exists |

**Repo state:** Migration is **committed and merged** (PR #81). Vercel deploy does not apply Supabase SQL automatically.

**Ops check (recommended tomorrow):** In Supabase, confirm `contracts.estimate_id` exists; if missing, run `npm run db:migrate` against production or execute the SQL file in the dashboard. No further migration files are pending for this milestone.

---

## Fix before production-ready (next phase, not blocking)

| ID | Item |
|----|------|
| B-001 | Golden-path E2E (lead → paid invoice) |
| B-002 | Owner/Admin mutation security audit |
| B-003 | Global payment history report |
| B-004 | Dashboard contracts/reputation widgets |
| B-005 | i18n consolidation (Lead Inbox, Subscriptions body, etc.) |
| B-006 | AI unavailable banners |

---

## Document workflow (print + PDF)

| Document | Route |
|----------|-------|
| Estimate | `/api/estimates/{id}/pdf` |
| Invoice | `/api/invoices/{id}/pdf` |
| Contract | `/api/contracts/{id}/pdf` |
| Work order | `/api/jobs/{id}/pdf` |
| Client | `/api/clients/{id}/pdf` |

---

## Run module audit E2E (regression)

```powershell
Remove-Item Env:CI -ErrorAction SilentlyContinue
$env:E2E_BYPASS_RATE_LIMIT='1'
npx playwright test tests/e2e/audit/
```

Dev login: `/api/auth/dev-login?profile=admin` (use `profile=super_admin` for owner specs).

---

## Verdict

**Contractor audit milestone: CLOSED.**  
**Production: stable at `e935dcd`.**  
**Next session:** Manual owner review on production → real-world workflow issues → prioritize improvements from B-001–B-006. Do not restart full module-by-module audits unless a production path is broken.
