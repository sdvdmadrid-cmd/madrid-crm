# Production readiness report — Madrid contractor platform

**Goal:** Polished contractor SaaS where every feature works start-to-finish.  
**Method:** Module-by-module usability audit (buttons, dropdowns, search, filters, forms, workflows, persistence, responsive UI, print/PDF).  
**Last updated:** 2026-05-28

---

## Summary

| Metric | Count |
|--------|-------|
| Modules in scope | 16 |
| Modules fully audited & documented | 7 (Clients, Estimates, Jobs, Invoices, Payments, Contracts, Lead Inbox) |
| Document PDF routes implemented | 5 (estimate, invoice, contract, job/work order, client) |
| Production-ready (whole platform) | **No** — audit in progress |

---

## Module status

| Module | Audit doc | E2E audit | Fixes this pass | Verdict |
|--------|-----------|-----------|-----------------|---------|
| **Clients** | [MODULE_AUDIT_CLIENTS.md](./audits/MODULE_AUDIT_CLIENTS.md) | `tests/e2e/audit/clients-module.spec.js` | List search, billing theme, client PDF UI | ✅ Module complete |
| **Estimates** | [MODULE_AUDIT_ESTIMATES.md](./audits/MODULE_AUDIT_ESTIMATES.md) · [Sign-off](./audits/ESTIMATES_MODULE_SIGN_OFF.md) | `tests/e2e/audit/estimates-module.spec.js` | PDF print/download, contract UX, editor PDF, a11y | ✅ **Signed off** |
| **Contracts** | [MODULE_AUDIT_CONTRACTS.md](./audits/MODULE_AUDIT_CONTRACTS.md) · [Sign-off](./audits/CONTRACTS_MODULE_SIGN_OFF.md) | `tests/e2e/audit/contracts-module.spec.js` | `/contracts` library, nav, search/filter, PDF | ✅ **Signed off** |
| **Jobs** | [MODULE_AUDIT_JOBS.md](./audits/MODULE_AUDIT_JOBS.md) · [Sign-off](./audits/JOBS_MODULE_SIGN_OFF.md) | `tests/e2e/audit/jobs-module.spec.js` | Dark theme, search, client filter, files panel, PDF | ✅ **Signed off** |
| **Invoices** | [MODULE_AUDIT_INVOICES.md](./audits/MODULE_AUDIT_INVOICES.md) · [Sign-off](./audits/INVOICES_MODULE_SIGN_OFF.md) | `tests/e2e/audit/invoices-module.spec.js` | List search crash fix, payment register E2E | ✅ **Signed off** |
| **Payments** | [MODULE_AUDIT_PAYMENTS.md](./audits/MODULE_AUDIT_PAYMENTS.md) · [Sign-off](./audits/PAYMENTS_MODULE_SIGN_OFF.md) | `tests/e2e/audit/payments-module.spec.js` | Connect UI, manual/partial pay, checkout API | ✅ **Signed off** |
| **Lead Inbox** | [MODULE_AUDIT_LEAD_INBOX.md](./audits/MODULE_AUDIT_LEAD_INBOX.md) · [Sign-off](./audits/LEAD_INBOX_MODULE_SIGN_OFF.md) | `tests/e2e/audit/lead-inbox-module.spec.js` | Convert redirect, filters, seed API, card UX | ✅ **Signed off** |
| Website Builder | — | Smoke | — | ⏳ |
| Reputation | — | Smoke | — | ⏳ |
| Service Catalog | — | Partial | — | ⏳ |
| Calendar | — | — | — | ⏳ |
| Dashboard | — | Partial | — | ⏳ |
| Settings | — | — | — | ⏳ |
| Subscriptions | — | Smoke | — | ⏳ |
| Owner/Admin | — | — | — | ⏳ |

---

## Document workflow (print + PDF download)

| Document | Print (PDF API) | Download (`?download=1`) | Browser HTML fallback |
|----------|-----------------|---------------------------|------------------------|
| Estimate | `/api/estimates/{id}/pdf` | ✅ | — |
| Invoice | `/api/invoices/{id}/pdf` | ✅ | ✅ |
| Contract | `/api/contracts/{id}/pdf` | ✅ | ✅ (from estimate kanban) |
| Work order | `/api/jobs/{id}/pdf` | ✅ | ✅ |
| Client record | `/api/clients/{id}/pdf` | ✅ | ✅ |

Shared UI: `src/components/workspace/DocumentPdfActions.jsx`  
Shared server helpers: `src/lib/document-pdf-core.js`

---

## What was tested (cumulative)

- **Clients:** Full module spec + existing contractor usability tests  
- **Jobs:** Full module spec (10 tests) + `jobs-files.spec.js`  
- **Invoices:** Full module spec (9 tests) + workflow send/PDF smoke  
- **Payments:** Full module spec (17 tests) — Connect, manual/partial, checkout  
- **Contracts:** Full module spec (8 tests) — library, kanban save, API list/PDF, filters  
- **Cross-module smoke:** Dashboard navigation, estimates draft/edit, jobs/invoices search, service catalog (`contractor-usability.spec.js`)  
- **Workflows:** Estimate PDF API, kanban send/contract/duplicate, jobs create, invoice send, payments/subscriptions smoke (`contractor-workflows.spec.js`)

---

## What was fixed (cumulative)

| Area | Fix |
|------|-----|
| Estimates | Edit hydration race; `DocumentPdfActions` on kanban; contract PDF after save |
| Clients | List search; dark billing form; client PDF print/download |
| Contracts API | Insert payload (tenant_id, Draft status, nullable fields) |
| Jobs | Dark theme, list search, `?clientId=` filter, files panel styling, module E2E |
| Invoices | `filterAndRankRecords` import (search crash), module E2E, `data-testid` on cards |
| Payments | Client collections audit spec; documents invoice↔payment workflows |
| Contracts | `/contracts` library page, sidebar nav, estimate→library link, collapsible preview |
| Lead Inbox | Convert→estimate redirect, source filter, summary bar, quick contact, E2E seed API |
| Invoices / Jobs | PDF API routes + `DocumentPdfActions` on list cards |
| Client search | Tokenized PostgREST query (`client-search.js`) |
| Print UX | Renamed confusing single “Print/Save PDF” links; split print vs download |

---

## What still needs work

1. **Remaining 9 modules** — each needs `docs/audits/MODULE_AUDIT_*.md`, dedicated E2E, responsive pass, and UX fixes before sign-off.  
2. **Prioritized UX backlog** — [UX_PRIORITIZED_BACKLOG.md](./audits/UX_PRIORITIZED_BACKLOG.md) (updated each sign-off).  
3. **E2E coverage** — CSV import, calendar, settings, owner/admin screens.  
4. **CI flake** — occasional client print / strict-mode failures in legacy specs.  
5. **Polish** — replace `alert`/`confirm` in dedupe and delete flows.  
6. **Deploy** — Latest audit fixes may be local only; verify `main` after merge.

---

## Blocking production readiness

| Blocker | Severity |
|---------|----------|
| Incomplete module-by-module audit (9 modules remaining) | **High** |
| No signed-off MODULE_AUDIT for Subscriptions (platform billing) | **Medium** |
| Contracts polish (estimate deep link, status UI, drawer clutter) | **Low** |
| Unverified production deploy of PDF routes + recent fixes | **Medium** |
| Owner/Admin & Settings not audited | **Medium** |
| Lead → client → estimate → job → invoice E2E golden path not one continuous spec | **Medium** |

---

## How to run audits locally

```powershell
Remove-Item Env:CI -ErrorAction SilentlyContinue
$env:E2E_BYPASS_RATE_LIMIT='1'
npx playwright test tests/e2e/audit/clients-module.spec.js
npx playwright test tests/e2e/audit/jobs-module.spec.js
npx playwright test tests/e2e/audit/invoices-module.spec.js
npx playwright test tests/e2e/audit/payments-module.spec.js
npx playwright test tests/e2e/audit/contracts-module.spec.js
npx playwright test tests/e2e/audit/lead-inbox-module.spec.js
npx playwright test tests/e2e/contractor-usability.spec.js tests/e2e/contractor-workflows.spec.js
```

Dev login: `/api/auth/dev-login?profile=admin`

---

## Next step

**Website Builder** — next in sequence. Lead Inbox signed off 2026-05-28 — see [LEAD_INBOX_MODULE_SIGN_OFF.md](./audits/LEAD_INBOX_MODULE_SIGN_OFF.md). Cumulative UX priorities: [UX_PRIORITIZED_BACKLOG.md](./audits/UX_PRIORITIZED_BACKLOG.md).
