# Module audit: Estimates

**Status:** Complete — **signed off** ([ESTIMATES_MODULE_SIGN_OFF.md](./ESTIMATES_MODULE_SIGN_OFF.md))  
**Last updated:** 2026-05-28  
**Scope:** Kanban pipeline (`/estimates`) + estimate editor (`/estimates/new`)

---

## Surfaces audited

| Surface | Path | Role |
|---------|------|------|
| Kanban pipeline | `/estimates` | Search, filters, columns, detail drawer |
| New / edit editor | `/estimates/new`, `/estimates/new?edit=` | Full estimate form |
| APIs | `/api/estimates/*` | CRUD, PDF, duplicate, contract, revisions |

---

## Controls tested

### Kanban toolbar
| Control | Result |
|---------|--------|
| Search estimates (`aria-label`) | ✅ Filters cards; shows `N shown` |
| Filter by status (dropdown) | ✅ All / draft / sent / changes / approved / declined |
| Hide test data (checkbox) | ✅ Hides E2E-named rows; `aria-label` added |
| Clear client filter | ✅ When `?clientId=` present |
| Refresh | ✅ Reloads list |
| + New Estimate | ✅ Navigates to editor |

### Kanban columns
Draft · Sent · Changes · Approved · Declined — cards show client, address, total, date.

### Detail drawer (per card)
| Action | Workflow | Persistence |
|--------|----------|-------------|
| ✕ Close | Closes panel | — |
| Backdrop click | Closes panel | — |
| Send to client / Resend | PATCH status `sent` + email channel | Status + audit timestamps refresh |
| Approve | Confirm → PATCH `approved` | ✅ |
| Decline | Confirm → PATCH `declined` | Not fully E2E (destructive confirm) |
| Request changes | Confirm → PATCH `changes_requested` | Not fully E2E |
| Edit estimate | Opens `/estimates/new?edit=` | — |
| Duplicate | POST duplicate → editor | New draft id |
| Client link | Public URL (disabled if missing) | — |
| Print estimate / Download PDF | `DocumentPdfActions` → `/api/estimates/:id/pdf` | ✅ API + download query |
| Generate contract | Inline form: category, option, language | — |
| Save contract | POST `/api/estimates/:id/contract` | ✅ Saved id + PDF actions |
| Print (browser) contract | HTML fallback | ✅ |
| Print contract / Download contract PDF | `/api/contracts/:id/pdf` | ✅ |
| History | GET revisions on panel open | Loads async |

### Editor (`/estimates/new`)
| Control | Result |
|---------|--------|
| Back | Returns to kanban |
| Client search autocomplete | ✅ Visible; prefill via `?clientId=` |
| Prefix / name / email / phone | ✅ |
| Service + billing address | ✅ Same-as-service toggle |
| Optimize with AI | Present (requires text + API) |
| Job description | ✅ Persists after save + reload |
| Base price, discount, tax | ✅ |
| Send via Email / Text checkboxes | Present |
| Save as draft | ✅ Creates + redirects `?edit=` |
| Save & Send | Opens preview modal (not full send E2E in module spec) |
| Print / Download PDF (when editing) | ✅ Added `DocumentPdfActions` in header |

---

## Document workflow

| Document | Print | Download | Notes |
|----------|-------|----------|-------|
| Estimate (kanban) | `/api/estimates/{id}/pdf` | `?download=1` | Branded PDFKit |
| Estimate (editor) | Same when `?edit=` | Same | Header actions |
| Contract (after save) | `/api/contracts/{id}/pdf` | `?download=1` | Stays visible after save (no auto-dismiss when persisted) |
| Contract (browser) | HTML pre block | Fallback | |

Public customer PDF: `/api/estimates/:id/public/pdf` — covered in `estimate-public-respond.spec.js`.

---

## Fixes applied (this module)

| Issue | Fix |
|-------|-----|
| Single “Print / Save PDF” link (no download) | `DocumentPdfActions` on kanban + editor |
| Contract panel auto-dismiss hid PDF buttons | No auto-dismiss when contract id saved |
| Contract PDF lost when panel closed | Footer “Saved contract” PDF row when id set |
| Switching cards left stale contract state | Clear contract state on card select |
| Hide test data missing `aria-label` | Added for E2E + a11y |
| Editor had no PDF export while editing | Header `DocumentPdfActions` when `editId` |

---

## UX notes (documented, not blocking)

- **No `/contracts` list page** — contracts only from estimate kanban; message references records not in nav.
- **Decline / Request changes** use confirm panel — tested approve path; decline not automated (destructive).
- **Save & Send** opens preview modal — full email delivery not asserted in module spec (kanban send path tested).
- **Client link** disabled until public link exists on estimate.
- **Duplicate** naming: opens editor; does not stay on kanban.

---

## Responsive

| Viewport | Kanban | Editor | Detail drawer |
|----------|--------|--------|---------------|
| Desktop 1280 | ✅ | ✅ | Fixed 22rem right panel |
| Tablet 768 | ✅ | ✅ | Full-width panel |
| Mobile 390 | ✅ | ✅ | Full-width panel; horizontal kanban scroll |

---

## E2E coverage

| File | Tests |
|------|-------|
| `tests/e2e/audit/estimates-module.spec.js` | 17 (includes sign-off checklist tests) |
| `tests/e2e/contractor-usability.spec.js` | Draft create, edit persist, filters |
| `tests/e2e/contractor-workflows.spec.js` | PDF API, send, contract, duplicate |
| `tests/e2e/estimate-quote-invoice-flow.spec.js` | Cross-module flow |
| `tests/e2e/estimate-public-respond.spec.js` | Public respond + PDF |

Run:

```powershell
$env:E2E_BYPASS_RATE_LIMIT='1'
npx playwright test tests/e2e/audit/estimates-module.spec.js
```

---

## Remaining follow-ups

- E2E: Save & Send preview → confirm send
- E2E: Decline + request changes confirm paths
- Dedicated contracts list module in navigation
- SMS send channel from kanban (editor has checkbox; kanban send is email-only today)

---

## Verdict

**Module ready for contractor daily use** for create → send → approve → contract → PDF → duplicate. Safe to proceed to **Contracts** (API + kanban subset) or **Jobs** per platform audit order.
