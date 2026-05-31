# Functional contractor audit (local dev)

**Date:** 2026-05-28 (updated)  
**Environment:** `http://localhost:3000` (dev-login admin), Supabase dev tenant  
**Methods:** Contractor-focused Playwright (`tests/e2e/contractor-usability.spec.js`), existing E2E suite, API spot-checks

This audit targets **real workflows** (click, save, search, complete flows)—not build/TypeScript health alone.

---

## Executive summary

| Area | Verdict |
|------|---------|
| Core CRM usability (clients, estimates, jobs/invoices search) | **Pass** — `contractor-usability.spec.js` (8 tests) |
| Estimate draft → kanban → edit scope note | **Pass** (was failing: edit hydration race; fixed) |
| Core estimate → approve → invoice APIs | **Pass** (existing E2E) |
| Client panel + migrated estimate linkage | **Pass** (`notes.clientUuid`, filtered “View all estimates”) |
| Search UX platform-wide | **Improved** — kanban + jobs + invoices + tokenized client search |
| Production polish at contractor scale | **Not ready** — many modules still lack full workflow E2E (send PDF, lead convert, jobs create, reputation sync, website publish) |

**Contractor E2E (local, no `CI=1`):**

| Suite | Tests | Coverage |
|-------|-------|----------|
| `contractor-usability.spec.js` | 8 | CRM create/search/save, catalog |
| `contractor-workflows.spec.js` | 9 | Send, PDF, contract, duplicate, jobs, invoices, website, reputation, print |

**Print/PDF audit:** see `docs/PRINT_PDF_AUDIT.md`.

**Broader E2E:** run `tests/e2e/` for API-heavy flows (approve/respond, bill-payments, website-builder).

---

## Module-by-module results

### Estimates (`/estimates`)

| Control / workflow | Tested | Result |
|--------------------|--------|--------|
| Sidebar nav | Yes | Loads kanban |
| Refresh | Not clicked | — |
| + New Estimate | Yes | Navigates to `/estimates/new` |
| Click card → detail drawer | Yes | Opens with actions |
| Send / Resend to client | Not clicked (needs email config) | — |
| Approve / Decline / Request changes | Not clicked | E2E covers public respond + internal status elsewhere |
| Edit estimate | Yes (via client panel link) | `/estimates/new?edit=…&clientId=…` |
| Duplicate | Not clicked | E2E covers duplicate API path |
| Client link / Download PDF | Not clicked | PDF route exists |
| Generate contract | Not clicked | UI panel present |
| **List search / filter** | Yes (E2E) | Search by client name; status filter; “Hide test data”; `?clientId=` |

**Contractor impact:** Dev DB still has many E2E rows — use **Hide test data** (default on) + search. Date-range filter still missing.

**Detail panel actions (when card selected):** Send, Approve, Decline, Request changes, Edit, Duplicate, Client link, PDF, Generate contract — present in UI; full email send not verified without SMTP.

---

### New estimate (`/estimates/new`)

| Control | Tested | Result |
|---------|--------|--------|
| Back / breadcrumb | Yes | Works |
| Save as draft / Save and send | Yes (E2E) | Draft save with `?clientId=`; scope note persists after kanban edit |
| Client search autocomplete | Yes | API returns matches; dropdown appears after ~150ms debounce |
| Client fields (name, email, phone, address) | Yes | Prefill from `?clientId=`; save blocked until client loaded |
| Pricing USD, discount, tax | Present | — |
| Optimize with AI | Present | Not exercised |
| Email / Text checkboxes | Yes | **Readonly** — contractor cannot turn off channels on form |

**Contractor impact (P1):** Readonly notification toggles may block valid workflows (e.g. draft-only save without SMS).

---

### Clients (`/clients`)

| Control | Tested | Result |
|---------|--------|--------|
| Top search autocomplete | Yes | `E2E` → 1 match after debounce; `h` → no matches (correct for this tenant’s data) |
| Search select action | Yes (E2E) | Option opens profile; **New estimate** button on each result |
| List row click | Yes | Opens details panel |
| Save / Clear / CSV menu | Partial | Panel + list load |
| Client details: estimates/invoices | Yes | 23 estimates, 23 invoices, 0 jobs |
| Create estimate / New job / New invoice quick links | Yes | Present |
| Edit estimate per row | Yes | Links to unified editor |
| View all estimates | Yes | **`/estimates?clientId=`** scoped filter |
| Quotes section | Yes | **Removed** (expected) |

**Contractor impact (P1):** Search-on-Clients is optimized for “start estimate,” not “open client.” List click is the path to profile—document in UI or offer a “View profile” in autocomplete.

**Search note:** Short query `h` only matches **name/company** (by design, `docs/SEARCH_BEHAVIOR.md`). In prod, names like “Hernandez” should rank first; dev tenant has no such names so empty is expected.

---

### Jobs (`/jobs`)

| Control | Tested | Result |
|---------|--------|--------|
| Page load | Partial | Loads |
| **List text search** | Yes (E2E) | Search jobs by title/client; empty state when no match |
| Create / edit / files / delete | E2E | File type validation + DELETE modal pass |

**Contractor impact (P1):** Cannot find a job by title/client from the jobs page without URL params.

---

### Invoices (`/invoices`)

| Control | Tested | Result |
|---------|--------|--------|
| Page | Not fully walked | — |
| **List text search** | Yes (E2E) | Search + `?clientId=` filter with “Show all” clear |
| Send / payment flows | E2E (related) | Partial via estimate→invoice flow |

---

### Calendar (`/calendar`)

| Workflow | Result |
|----------|--------|
| Weather strip on load | Pass (E2E) |
| Block past dates | Pass (E2E) |
| Save/edit keeps date | Pass (E2E) |
| API rejects past dates | Pass (E2E) |

---

### Lead inbox (`/lead-inbox`)

| Control | Tested | Result |
|---------|--------|--------|
| Page load | Yes | Empty queue in dev |
| Search + status filter | Not testable | No rows |
| Convert to client/estimate | Not testable | Code path exists (`lead-inbox/convert` → `estimates`) |

**Contractor impact (P2):** No E2E for convert workflow; verify on staging with real leads.

---

### Bill payments (`/bill-payments`)

| Workflow | Result |
|----------|--------|
| Processing center filters + URL state | Pass (E2E) |
| Add bill drawer + validation | Pass (E2E) |
| Wallet → payment methods link | **Flaky** (30s timeout once, retry pass) |

---

### Build website (`/website`)

| Workflow | Result |
|----------|--------|
| Public site / draft 404 / slug rules / industry preset | Pass (E2E) |

---

### Dashboard (`/dashboard`)

| Control | Tested | Result |
|---------|--------|--------|
| Revenue cards / checklist | Not walked | No dedicated E2E |

---

### Service catalog (`/services-catalog`)

| Workflow | Result |
|----------|--------|
| Add / edit / list | **Pass** (E2E: create + update persists) |
| Search | Code | **No search bar** (fine until catalog is large) |

---

### Reviews & reputation (`/reputation`)

| Search | Code | **No search bar** |

---

### Subscriptions / Settings / Client payments

| Module | Tested | Result |
|--------|--------|--------|
| Subscriptions | No | — |
| Settings | No | — |
| Client payments (sidebar) | No | — |

---

### Legacy / duplicate systems

| Item | Status |
|------|--------|
| `/estimate-builder` UI | Removed; middleware → `/estimates/new` |
| `estimate_builder` table | Migrated (37 rows); history preserved |
| Public `/quote/[token]` + `/api/public/quotes` | **Still active** for old Jobber-style quotes |
| Client panel “Quotes” | Removed |

**Contractor impact (P2):** Old public quote links still work; internal UI is estimates-only. Consider read-only “Imported quotes” history page.

---

## Automated test coverage map

| Module | E2E spec | Gap |
|--------|----------|-----|
| **Contractor usability (UI)** | `contractor-usability.spec.js` | Kanban Send/PDF/contract; jobs create; lead convert |
| Estimates approve/respond/duplicate | `estimate-quote-invoice-flow`, `estimate-public-respond` | API-first; complements usability spec |
| Calendar | `calendar.spec.js` | Good |
| Jobs files/delete | `jobs-files.spec.js` | No create-job UI flow |
| Bill payments | `bill-payments*.spec.js` | Processing center covered |
| Website | `website-builder-saas`, `website-funnel` | Good |
| Tenant isolation | `tenant-isolation.spec.js` | Good |
| Lead inbox convert | — | **None** (needs staging lead) |
| Invoices send/UI | — | List search only in usability spec |
| Reputation sync | — | Page load only |

---

## Priority fix backlog

### P0 — Blocks daily contractor use

1. **Estimates kanban: date range / estimate # search** (client name search done).
2. **Full-module workflow E2E** still missing: kanban Send, PDF download, contract generate, invoice send, lead convert, job create+save UI.

### P1 — Confusing or incomplete UX

3. **New estimate:** Email/Text toggles still readonly on form (draft path OK; send path may confuse).
4. **Service catalog + reputation:** add list search when catalogs grow.
5. **Jobs:** E2E for create job + scope persist (files flow exists separately).

### P2 — Polish / coverage

6. Lead inbox convert on staging with real leads.
7. Jobber history UI for archived `quotes` / `estimate_builder` (optional).
8. Admin list pages: upgrade simple `includes()` to `record-search` (per `SEARCH_BEHAVIOR.md`).

### Done (2026-05-28 usability pass)

- Estimates kanban search/filter/hide-test-data/`?clientId=`
- Client panel filtered estimates link; clients search profile + new estimate
- Jobs + invoices list search
- Client search tokenization (middle words)
- Estimate edit hydration race (scope note wiped after save)
- `contractor-usability.spec.js` + `contractor-workflows.spec.js`
- **Print/PDF:** estimate kanban “Print / Save PDF”; invoice “Print / Save PDF”; job “Print work order”; client “Print record”; contract “Print contract” after generate
- **Bug fix:** contract save from estimate (`client_id` null / wrong types broke insert)

---

## What passed (production-ready paths)

- Unified estimate creation UI at `/estimates/new` (desktop layout, client autocomplete, USD pricing).
- Estimate public respond (approve / decline / changes_requested) with token gates and 409 concurrency.
- Estimate → approval → invoice handoff (E2E).
- Client details panel loads linked estimates/invoices after migration (`clientUuid` in notes).
- Client search API ranking (`E2E`, `Austin` queries verified).
- Calendar scheduling rules and weather strip.
- Website builder publish/slug flows.
- Tenant isolation on CRM list APIs.

---

## Fixes applied (2026-05-28 usability pass)

- **`tests/e2e/contractor-usability.spec.js`:** 8 UI workflows (dashboard, clients, estimates draft/edit, kanban filters, jobs/invoices search, service catalog CRUD, module smoke).
- **Estimate editor:** cancel stale `?edit=` hydration (fixes scope note disappearing after save); loading gate on save buttons; post-save notes from API payload.
- **`src/lib/client-search.js`:** tokenized SQL filter so “UX Audit Client” matches names with extra words.
- **`PlacesAutocomplete`:** no Google dropdown on programmatic address fill.
- **Estimates kanban / clients / jobs / invoices:** search and filters (see prior PR #79 items).
- **Client form:** distinct `aria-label`s; clients page “Find a client” heading.

---

## Recommended verification on production (post-deploy)

1. Clients: type `h` with real Hispanic surnames — confirm top results are name matches, not random emails.
2. `/estimates/new?clientId=` — fields auto-fill from selected client.
3. Client panel — estimates count matches Supabase for a migrated Jobber client.
4. Full path: create estimate → send → client approves public link → invoice appears.
5. Confirm `/estimate-builder` redirects to `/estimates/new`.

---

## How to re-run

```bash
# Contractor audits (dev server on :3000; do not set CI=1 locally)
Remove-Item Env:CI -ErrorAction SilentlyContinue
$env:E2E_BYPASS_RATE_LIMIT='1'
npx playwright test tests/e2e/contractor-usability.spec.js tests/e2e/contractor-workflows.spec.js --reporter=list

# Full E2E suite
npx playwright test tests/e2e/ --reporter=list

# Unified estimates guard
npm run verify:estimates-unified
```

Browser audit: dev-login `http://localhost:3000/api/auth/dev-login?profile=admin&redirect=/estimates`
