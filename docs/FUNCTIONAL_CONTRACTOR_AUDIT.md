# Functional contractor audit (local dev)

**Date:** 2026-05-30  
**Environment:** `http://localhost:3000` (dev-login admin), Supabase dev tenant  
**Methods:** Live browser walkthrough (Cursor browser), API spot-checks, Playwright E2E (`tests/e2e/`, 33 tests)

This audit targets **real workflows** (click, save, search, complete flows)—not build/TypeScript health alone.

---

## Executive summary

| Area | Verdict |
|------|---------|
| Core estimate → approve → invoice APIs | **Pass** (E2E + manual kanban detail panel) |
| Unified `/estimates/new` workflow | **Pass** (layout, client autocomplete, save buttons present) |
| Client panel + migrated estimate linkage | **Pass** (23 estimates/invoices for test client via `notes.clientUuid`) |
| Search UX platform-wide | **Mixed** — ranking fixes work for API; several modules still have **no list search** |
| Production polish at contractor scale | **Not ready** — estimates kanban overload, test-data noise, coverage gaps |

**Playwright:** 31 passed, 1 skipped (published lead site), 1 flaky (bill-payments wallet link timeout on first run, passed on retry).

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
| **List search / filter** | Code review | **Missing** — no search by client name, estimate #, or date |

**Contractor impact (P0):** Kanban shows **100+ E2E/EB Lock test cards** with no search, filter, or archive. Daily use is impractical until search exists or test rows are purged/archived.

**Detail panel actions (when card selected):** Send, Approve, Decline, Request changes, Edit, Duplicate, Client link, PDF, Generate contract — present in UI; full email send not verified without SMTP.

---

### New estimate (`/estimates/new`)

| Control | Tested | Result |
|---------|--------|--------|
| Back / breadcrumb | Yes | Works |
| Save as draft / Save and send | Present | Not full save+reload in this pass |
| Client search autocomplete | Yes | API returns matches; dropdown appears after ~150ms debounce |
| Client fields (name, email, phone, address) | Yes | Readonly until client selected (correct guard) |
| Pricing USD, discount, tax | Present | — |
| Optimize with AI | Present | Not exercised |
| Email / Text checkboxes | Yes | **Readonly** — contractor cannot turn off channels on form |

**Contractor impact (P1):** Readonly notification toggles may block valid workflows (e.g. draft-only save without SMS).

---

### Clients (`/clients`)

| Control | Tested | Result |
|---------|--------|--------|
| Top search autocomplete | Yes | `E2E` → 1 match after debounce; `h` → no matches (correct for this tenant’s data) |
| Search select action | Code | **Navigates to `/estimates/new?clientId=`** — not client profile |
| List row click | Yes | Opens details panel |
| Save / Clear / CSV menu | Partial | Panel + list load |
| Client details: estimates/invoices | Yes | 23 estimates, 23 invoices, 0 jobs |
| Create estimate / New job / New invoice quick links | Yes | Present |
| Edit estimate per row | Yes | Links to unified editor |
| View all estimates | Yes | Goes to **`/estimates` unfiltered** — not scoped to client |
| Quotes section | Yes | **Removed** (expected) |

**Contractor impact (P1):** Search-on-Clients is optimized for “start estimate,” not “open client.” List click is the path to profile—document in UI or offer a “View profile” in autocomplete.

**Search note:** Short query `h` only matches **name/company** (by design, `docs/SEARCH_BEHAVIOR.md`). In prod, names like “Hernandez” should rank first; dev tenant has no such names so empty is expected.

---

### Jobs (`/jobs`)

| Control | Tested | Result |
|---------|--------|--------|
| Page load | Partial | Loads |
| **List text search** | Code | **None** — filter only via `?clientId=` URL |
| Create / edit / files / delete | E2E | File type validation + DELETE modal pass |

**Contractor impact (P1):** Cannot find a job by title/client from the jobs page without URL params.

---

### Invoices (`/invoices`)

| Control | Tested | Result |
|---------|--------|--------|
| Page | Not fully walked | — |
| **List text search** | Code | **None** — `?clientId=` filter only |
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

| Search | Code | **No search bar** |

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
| Estimates approve/respond/duplicate | `estimate-quote-invoice-flow`, `estimate-public-respond` | No UI test for kanban Send/PDF/contract |
| Calendar | `calendar.spec.js` | Good |
| Jobs files/delete | `jobs-files.spec.js` | No create-job UI flow |
| Bill payments | `bill-payments*.spec.js` | Wallet link flaky |
| Website | `website-builder-saas`, `website-funnel` | Good |
| Tenant isolation | `tenant-isolation.spec.js` | Good |
| **Clients CRUD/search** | — | **None** |
| **Lead inbox convert** | — | **None** |
| **Invoices send/UI** | — | **None** |
| **Dashboard** | — | **None** |
| **Reputation / catalog / settings** | — | **None** |

---

## Priority fix backlog

### P0 — Blocks daily contractor use

1. **Estimates kanban: add search/filter** (client name, estimate #, status, date range).
2. **Estimates kanban: paginate or collapse archived/test data** — dev DB is dominated by E2E rows.
3. **Client “View all estimates”** should link to filtered view (`/estimates?clientId=` or in-app filter), not unfiltered kanban.

### P1 — Confusing or incomplete UX

4. **Jobs list: add search** (title, client, address).
5. **Invoices list: add search** (number, client, status).
6. **Clients search:** optional “Open client profile” vs always “New estimate” (or split actions in dropdown).
7. **New estimate:** allow toggling Email/Text delivery off (remove readonly on checkboxes when appropriate).
8. **Bill payments:** fix wallet link flake (loading state / selector / timeout).
9. **Migrated estimates:** `client_id` bigint vs UUID — panel uses `notes ilike %uuid%`; ensure new saves always set `clientUuid` in notes (already on create API).

### P2 — Polish / coverage

10. E2E: clients search select, client panel, lead convert, invoice send.
11. Lead inbox empty state copy is fine; test convert on staging.
12. Service catalog + reputation: search when lists grow.
13. Jobber history UI for archived `quotes` / `estimate_builder` (optional).
14. Admin list pages: upgrade simple `includes()` to `record-search` (per `SEARCH_BEHAVIOR.md`).

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

## Fixes applied (2026-05-30)

- **Estimates kanban:** search bar, status filter, “Hide test data” (default on), `?clientId=` filter from client panel.
- **Client panel:** “View all estimates” → `/estimates?clientId=…`.
- **Clients search:** row opens profile; **New estimate** secondary action on each result.
- **Jobs / Invoices:** list search inputs; invoices respect `?clientId=`.
- **API:** `clientUuid` on serialized estimates for client-scoped filtering.
- **Bill payments:** wallet CTA is a direct link (fixes flaky Playwright navigation).

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
# E2E (dev server must be on :3000; do not set CI=1 locally)
Remove-Item Env:CI -ErrorAction SilentlyContinue
$env:E2E_BYPASS_RATE_LIMIT='1'
npx playwright test tests/e2e/ --reporter=list

# Unified estimates guard
npm run verify:estimates-unified
```

Browser audit: dev-login `http://localhost:3000/api/auth/dev-login?profile=admin&redirect=/estimates`
