# Module audit: Contracts

**Status:** Complete — **signed off** ([CONTRACTS_MODULE_SIGN_OFF.md](./CONTRACTS_MODULE_SIGN_OFF.md))  
**Last updated:** 2026-05-28  
**Scope:** Service agreements generated from estimates, contract library, PDF/print

---

## What this module includes

| Surface | Path / API | Contractor purpose |
|---------|------------|-------------------|
| Contract library | `/contracts` | Find saved agreements; search, filter, print/PDF |
| Generate from estimate | `/estimates` kanban detail drawer | Category, option, language → AI body → save |
| Persist contract | `POST /api/estimates/:id/contract` | Save row with `persist: true` |
| List API | `GET /api/contracts` | Tenant-scoped library data |
| Update status | `PATCH /api/contracts/:id` | Status and metadata (no dedicated UI yet) |
| Contract PDF | `GET /api/contracts/:id/pdf` | Print + download (`DocumentPdfActions`) |
| Sidebar nav | `AuthShell` → Contracts | Discoverability (added this audit) |

**Out of scope:** E-signature providers, version diffing, standalone “new contract without estimate” (CTA routes to Estimates).

---

## Workflows tested

### Contract library (`/contracts`)

| Control | Result |
|---------|--------|
| Page load + heading | ✅ |
| Search (client, category, status tokens) | ✅ `filterAndRankRecords` |
| Status filter (dynamic options from data) | ✅ E2E: Signed shows row; Draft hides after PATCH |
| `?clientId=` filter + “Show all contracts” | ✅ |
| Contract cards (`data-testid="contract-card"`) | ✅ |
| PDF download API | ✅ `content-type: pdf` |
| Print (PDF link) + Print (browser) + Download PDF | ✅ On cards |
| “Create from estimate” CTA | ✅ Links to `/estimates` |
| Refresh list | ✅ |
| Responsive layout (desktop / tablet / mobile) | ✅ Filter bar + search visible |

### Estimate kanban integration

| Workflow | Result |
|----------|--------|
| Open estimate card → Generate contract panel | ✅ |
| Save contract (`persist`) | ✅ Success copy + contract id snippet |
| “View all contracts” link after save | ✅ → `/contracts` |
| Print contract / Download contract PDF in drawer | ✅ |
| Saved contract appears in library after UI flow | ✅ |

### API

| Endpoint | Result |
|----------|--------|
| `GET /api/contracts` | ✅ Array includes persisted category |
| `POST /api/estimates/:id/contract` | ✅ Used in E2E setup |
| `PATCH /api/contracts/:id` | ✅ Status update (E2E only; no list UI) |

---

## Fixes delivered this audit

| Area | Change |
|------|--------|
| **Missing library** | New `/contracts` page — primary gap before audit |
| **Navigation** | Sidebar + breadcrumb (`crm-navigation`) |
| **Misleading copy** | Success text now points to Contracts menu + link |
| **Discoverability** | `Link` to `/contracts` from estimate drawer after save |
| **E2E** | Dedicated `contracts-module.spec.js` (library + kanban + API) |

---

## Contractor usability findings

### Visual clutter / too many actions

| Location | Severity | Notes |
|----------|----------|-------|
| **Estimate detail drawer** | **High** | Send, Approve, Decline, Request changes, Edit, Duplicate, Client link, Estimate PDF, Generate contract — 8+ actions before contract sub-panel |
| **Contract card actions** | Medium | Print PDF, Download PDF, Print (browser), Estimates link — four controls per row; wraps on mobile |
| **Contract panel (kanban)** | Medium | Inline styles; extra row of buttons when saved (PDF + browser print + cancel) |

### Missing reports / summary views

| Gap | Severity | Notes |
|-----|----------|-------|
| No contracts dashboard widget | Medium | Stats tile exists in i18n but library is only list |
| No “pending signature” / aging report | Medium | Status is free text (`Draft`, etc.) without workflow board |
| No export (CSV/PDF bundle) | Low | Per-row PDF only |

### Unnecessary clicks

| Friction | Severity | Notes |
|----------|----------|-------|
| **No direct “open source estimate”** | **High** | Card links to generic `/estimates`, not `?edit=` or kanban selection |
| **Create path always via Estimates** | Medium | By design, but two hops (menu → estimates → card → generate) |
| **No inline status change on library** | Medium | Must use API or future UI; filter-only today |
| **Refresh manual** | Low | No auto-refresh after save from another tab |

### Missing filtering

| Gap | Severity | Notes |
|-----|----------|-------|
| Status filter only lists values **present in loaded data** | Medium | “Signed” absent until at least one Signed row — confusing for new tenants |
| No date range / category / language filters | Medium | Search tokens help; no dropdowns |
| No “linked job” filter | Low | `jobId` on row but not exposed in UI |

### Print / PDF

| Item | Result |
|------|--------|
| Server PDF per contract | ✅ |
| Download with `?download=1` | ✅ via `DocumentPdfActions` |
| Browser HTML print (library + kanban) | ✅ |
| Batch print selected contracts | ❌ Not available |

### Wasted screen space

| Issue | Notes |
|-------|-------|
| **Body preview on every card** | Large `pre`-style block duplicates PDF content — pushes actions below fold on mobile |
| **Hero header** | Top bar + CTA + subtitle — could be compact toolbar like Jobs/Invoices |

### Search behavior

| Behavior | Assessment |
|----------|------------|
| Tokenized rank search | ✅ Consistent with Jobs/Invoices |
| Placeholder mentions status | ✅ |
| No highlight of matched field | Low — same as other modules |
| Search does not scope to `?clientId=` differently | OK — client filter is separate |

### Mobile usability

| Item | Result |
|------|--------|
| Search + status on narrow viewport | ✅ Visible in E2E |
| Action button wrap on cards | ⚠️ Usable but crowded |
| Kanban drawer + contract panel | ⚠️ Long scroll; contract form 2-column grid tight on 390px |
| Body preview horizontal overflow | ⚠️ Long agreement text in card |

### Daily-use frustration (works but annoying)

| Issue | Notes |
|-------|-------|
| Success said “contract records” with **no list** before fix | Fixed with `/contracts` |
| **English-only contract UI strings in kanban** | Library i18n; drawer still hard-coded English |
| **Category free-text** | Easy typos; no catalog picker from Service Catalog |
| **Regenerate overwrites** | Unclear if second save creates new row vs update — contractors may duplicate agreements |
| **No client portal sign flow** | Contract is internal PDF, not client e-sign |
| Contract AI latency | “Generating…” with no cancel — acceptable but noted in Estimates audit |

---

## E2E evidence

```text
tests/e2e/audit/contracts-module.spec.js — 8/8 passed (2026-05-28)
tests/e2e/audit/estimates-module.spec.js — contract generate/save/PDF (prior)
tests/e2e/contractor-workflows.spec.js — contract smoke (prior)
```

---

## Related

- [CONTRACTS_MODULE_SIGN_OFF.md](./CONTRACTS_MODULE_SIGN_OFF.md)  
- [MODULE_AUDIT_ESTIMATES.md](./MODULE_AUDIT_ESTIMATES.md)  
- [PRODUCTION_READINESS_REPORT.md](../PRODUCTION_READINESS_REPORT.md)
