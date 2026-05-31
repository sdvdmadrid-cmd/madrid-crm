# Module audit: Invoices

**Status:** Complete — **signed off** ([INVOICES_MODULE_SIGN_OFF.md](./INVOICES_MODULE_SIGN_OFF.md))  
**Last updated:** 2026-05-28  
**Scope:** Invoices workspace (`/invoices`) — create/edit, payments, client comms, print/PDF

---

## Surfaces audited

| Surface | Path | Role |
|---------|------|------|
| Invoices page | `/invoices` | Form, list, per-invoice actions |
| Deep link | `/invoices?clientId=` | Client-scoped list |
| APIs | `/api/invoices/*`, PDF, send, checkout, payments | Backend workflows |
| Guide | `InvoiceClientPaymentsGuide` | Stripe / get-paid onboarding |

---

## Critical defect fixed

| Issue | Impact | Fix |
|-------|--------|-----|
| `filterAndRankRecords is not defined` | **Runtime crash** when typing in list search — entire invoice list unusable | Added `import { filterAndRankRecords } from "@/lib/record-search"` |

---

## Controls tested

### Form (admin)
| Control | Result |
|---------|--------|
| Invoice number | ✅ Optional; server may allocate `INV-####` |
| Client (`ClientPickerField` / Search clients combobox) | ✅ Free-text or linked client |
| Title, Quote #, Amount, Due date | ✅ |
| Preferred payment method | ✅ |
| Line items, Notes | ✅ |
| AI complete invoice | Present (API) |
| Save / Update / Clear | ✅ E2E |

### List
| Control | Result |
|---------|--------|
| Search invoices | ✅ Fixed import; ranks #, client, title, status |
| Client filter + Show all | ✅ `?clientId=` |
| Empty state | ✅ “No invoices match your search.” |

### Card actions
| Action | Result |
|--------|--------|
| Print / Save PDF + Download PDF | ✅ `DocumentPdfActions` |
| Print (browser) | Present |
| Send by email / text | Present (API; workflow spec) |
| Share payment link | Present |
| Charge online (Stripe) | Present when configured |
| Register payment | ✅ Partial cash payment E2E |
| Edit / Delete | ✅ Edit E2E; delete manual |

---

## Document workflow

| Document | Print | Download |
|----------|-------|----------|
| Invoice PDF | `/api/invoices/{id}/pdf` | `?download=1` |
| Payment receipt | Opens after register payment (HTML) | Browser print |

---

## Contractor UX notes

| Topic | Assessment |
|-------|------------|
| Get-paid guide | ✅ Clear distinction: client pays contractor via Stripe |
| Card action density | Many buttons per card — wraps on mobile; acceptable for power users |
| Client field | Must use **Search clients** combobox (not a plain “Client” placeholder) |
| Custom invoice numbers | Typing `INV-AUDIT-*` may not appear on card if server normalizes/allocates; search by **client name** or **title** is reliable |

---

## E2E evidence

```text
tests/e2e/audit/invoices-module.spec.js — 9/9 passed (2026-05-28)
tests/e2e/contractor-workflows.spec.js — invoice API + PDF + send
tests/e2e/contractor-usability.spec.js — search + client filter
```

---

## Related

- [INVOICES_MODULE_SIGN_OFF.md](./INVOICES_MODULE_SIGN_OFF.md)  
- [PRODUCTION_READINESS_REPORT.md](../PRODUCTION_READINESS_REPORT.md)
