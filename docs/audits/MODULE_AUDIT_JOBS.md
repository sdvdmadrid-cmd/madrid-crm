# Module audit: Jobs / Work Orders

**Status:** Complete — **signed off** ([JOBS_MODULE_SIGN_OFF.md](./JOBS_MODULE_SIGN_OFF.md))  
**Last updated:** 2026-05-28  
**Scope:** Jobs workspace (`/jobs`) — create/edit/delete jobs, list search, client filter, files, print/PDF

---

## Surfaces audited

| Surface | Path | Role |
|---------|------|------|
| Jobs page | `/jobs` | Form (new/edit), job list, per-card actions |
| Deep link | `/jobs?clientId=` | Filter list + prefill client on new job |
| APIs | `/api/jobs/*`, `/api/jobs/:id/pdf` | CRUD, work order PDF |
| Files | `/api/jobs/:id/files` | Photos/documents (panel UI; upload E2E in `jobs-files.spec.js`) |

---

## Controls tested

### Header & form
| Control | Result |
|---------|--------|
| Title, Client, Service, Scope (AI) | ✅ Dark-themed inputs; `aria-label` on fields |
| Complexity / Urgency selects | ✅ |
| Materials included checkbox | ✅ |
| Status (Pending / In progress / Completed) | ✅ Persists on save/update |
| Price, Tax state, Down payment %, Due date | ✅ Financial summary on cards |
| AI estimator (Calculate / Use recommended) | Present — requires `/api/ai/estimate` (not E2E) |
| Proposal generator (AI) | Present — requires `/api/ai/proposal` (not E2E) |
| Save / Update | ✅ Create + edit flows |
| Clear | ✅ Exits edit mode; resets form |

### List toolbar
| Control | Result |
|---------|--------|
| Search jobs (`aria-label`) | ✅ Tokenized search (title, client, service, status) |
| Clear client filter | ✅ When `?clientId=` active |
| Client-only banner | ✅ “Showing jobs for the selected client only.” |

**Gap (non-blocking):** No dedicated status dropdown filter — contractors can search by status text (e.g. “Completed”).

### Job card actions
| Action | Workflow | Persistence |
|--------|----------|-------------|
| Manage files / Hide files | Toggle `job-files-panel` | — |
| Print work order | `DocumentPdfActions` → `/api/jobs/:id/pdf` | ✅ |
| Download PDF | `?download=1` | ✅ API |
| Print (browser) | HTML summary in new window | ✅ |
| Edit | Loads form; scroll to top | ✅ Update persists |
| Delete | Modal; type `DELETE` | Partial E2E (`jobs-files.spec.js`) |

### Files panel (expanded card)
| Control | Result |
|---------|--------|
| Upload Photos / Documents | ✅ Buttons visible; validation in `jobs-files.spec.js` |
| Photos / Documents lists | ✅ Dark theme (audit pass) |
| Delete file | Confirm modal — manual smoke |

---

## Document workflow

| Document | Print | Download | Notes |
|----------|-------|----------|-------|
| Work order (PDF) | `/api/jobs/{id}/pdf` | `?download=1` | PDFKit; branded |
| Work order (browser) | `printJobSummary()` | HTML table in print window | Fallback |

---

## Responsive / layout (contractor lens)

| Viewport | Findings |
|----------|----------|
| Desktop 1280×800 | Form above list is long; acceptable for field office desktop |
| Tablet 768×1024 | Form grid wraps; card actions wrap |
| Mobile 390×844 | Search + form usable; card action row wraps |

**Layout notes:** Job cards show full financial breakdown — useful for billing review but verbose on mobile. Consider collapsible “Financials” section in a future polish pass.

**Readability:** Dark workspace theme applied to form, list search, cards, estimator panel, files panel. Proposal box subtext uses theme muted color.

---

## UX issues found & disposition

| Issue | Severity | Status |
|-------|----------|--------|
| Light-theme inline styles on form/cards/files | High | ✅ Fixed (`jobs.module.css` + class-based files panel) |
| Light green estimator box on dark page | Medium | ✅ `estimatorPanel` dark styling |
| No status filter dropdown (search only) | Low | Open — search works |
| Form always above list (long scroll to list after save) | Low | Open — `scrollTo` on edit helps |
| Delete job full flow not in module spec | Low | Covered in `jobs-files.spec.js` |
| AI estimator/proposal depend on external API | Info | Manual / staging smoke |

---

## Duplicate / legacy navigation

- Single `/jobs` route — no duplicate job list elsewhere.
- “Print (browser)” coexists with PDF print — intentional fallback (same pattern as invoices/estimates).

---

## E2E evidence

```text
tests/e2e/audit/jobs-module.spec.js — 10/10 passed (2026-05-28)
tests/e2e/jobs-files.spec.js — file validation + delete modal
tests/e2e/contractor-usability.spec.js — jobs search smoke
```

---

## Related

- [JOBS_MODULE_SIGN_OFF.md](./JOBS_MODULE_SIGN_OFF.md)  
- [PRODUCTION_READINESS_REPORT.md](../PRODUCTION_READINESS_REPORT.md)  
- [PRINT_PDF_AUDIT.md](../PRINT_PDF_AUDIT.md)
