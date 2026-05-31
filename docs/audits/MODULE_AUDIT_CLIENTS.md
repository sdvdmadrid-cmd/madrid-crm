# Module audit: Clients

**Status:** Complete (first module in platform-wide contractor audit)  
**Last updated:** 2026-05-28  
**Auditor:** Automated E2E + manual code review

## Scope

| Area | Covered |
|------|---------|
| Create / edit / save client | Yes |
| List search (sidebar cards) | Yes (added) |
| Top autocomplete search | Yes |
| Details side panel | Yes |
| Quick actions (estimate, job, invoice) | Yes |
| CSV import menu | Smoke (wizard opens via menu — not full CSV E2E) |
| Dedupe duplicates | Manual only (confirm dialog) |
| Delete client | Partial (confirm dialog — destructive, skipped in CI) |
| Print / PDF export | Yes |
| Responsive (desktop / tablet / mobile) | Yes (layout E2E) |
| Data persistence after refresh | Yes |

## Controls tested

### Forms
- Name, company, phone, email, service address (Places), city/state/zip
- Billing address block (same-as-service checkbox + alternate billing)
- Notes
- Save / Cancel

### Search & filters
- **Find a client** autocomplete (`ClientSearchAutocomplete`)
- **Client list** search (`listSearch` on card grid)

### Buttons & actions (per card)
- Edit, Delete (role-gated), New estimate shortcut
- Details panel: New estimate, New job, New invoice, Print record (PDF), Download PDF, Print (browser), Edit, Delete, Close

### Workflows (click → completion)
1. Create client → appears in list → survives reload  
2. Edit client → card title updates  
3. Autocomplete → open details panel → links visible  
4. Autocomplete → New estimate → `/estimates/new?clientId=`  
5. Details → PDF API returns `application/pdf`; download query sets `attachment`

## Fixes applied (this module)

| Issue | Fix |
|-------|-----|
| No way to filter long client lists | Added `listSearch` + `filterAndRankRecords` in `ClientsPageClient` / `ClientsList` |
| Billing section used light-theme inline colors on dark workspace | Switched to `cf-panel` / `cf-muted` / light text colors |
| Only HTML print for client record | Added `DocumentPdfActions` → `/api/clients/[id]/pdf` + `?download=1` |
| Highlight conflated edit selection | List highlight uses `highlightedClientId \|\| selectedId` |

## UX notes (not blocking, documented)

- **Duplicate search UX:** Top combobox (server search) vs list search (local filter) — intentional but contractors should learn: combobox for jump-to, list search for scanning.
- **Dedupe** uses `window.confirm` / `alert` — functional but not polished.
- **Delete** requires confirm — no undo.

## Document workflow (Clients)

| Action | Implementation |
|--------|----------------|
| Print record | `DocumentPdfActions` → `/api/clients/{id}/pdf` (browser print via PDF viewer) |
| Download PDF | Same route with `?download=1` |
| Print (browser) | HTML summary via `openPrintableHtmlDocument` (fallback) |

## E2E

`tests/e2e/audit/clients-module.spec.js` — 6 tests including 3 viewport layout checks.

Also covered in `tests/e2e/contractor-usability.spec.js` (create + autocomplete flows).

## Remaining / follow-ups

- Full CSV import wizard E2E (file upload, column mapping)
- Delete client E2E with test tenant cleanup
- Billing address distinct-from-service save verification E2E
- Card keyboard focus ring audit on mobile

## Verdict

**Module ready for contractor daily use** with documented gaps above. Safe to proceed to **Estimates** module audit.
