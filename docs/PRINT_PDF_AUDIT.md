# Print / PDF capability audit (contractor perspective)

**Date:** 2026-05-28  
**Question:** Where would a contractor expect to print or save a professional PDF, and what exists today?

---

## Summary

| Document | Save PDF (server) | Print (browser) | Gap severity |
|----------|-------------------|-----------------|--------------|
| Estimate (internal) | Yes — `/api/estimates/:id/pdf` | Kanban + editor: **Print estimate** + **Download PDF** | Low |
| Estimate (customer) | Yes — public PDF + link | `/estimate/[id]` — Print + Download | Low |
| Signed quote (legacy) | Via public quote URL | `/quote/[token]?print=signed` | Low |
| Invoice | Yes — `/api/invoices/:id/pdf` | Print + Download PDF + HTML fallback | Low |
| Payment receipt | N/A | After register payment (HTML popup) | Low |
| Contract | Yes — `/api/contracts/:id/pdf` | Estimate kanban after generate | Medium — no `/contracts` list page |
| Job / work order | Yes — `/api/jobs/:id/pdf` | Print + Download PDF + HTML fallback | Low |
| Client record | Yes — `/api/clients/:id/pdf` | Print + Download PDF + HTML fallback | Low |
| Bill payment | Export API | Processing center (data export, not doc print) | Low |

---

## Estimates

| Surface | Path | Capability |
|---------|------|------------|
| Kanban detail | `/estimates` | **Print / Save PDF** → authenticated PDF stream |
| Editor | `/estimates/new` | Use kanban or PDF API after save |
| Customer view | `/estimate/[id]?token=…` | Download PDF + **Print / Save as PDF** |
| Public respond | `/estimate/[id]` | Same as customer view when token valid |

**Contractor note:** PDF includes company branding from `company_profiles`. For drafts, kanban PDF still works.

---

## Invoices

| Surface | Capability |
|---------|------------|
| Invoice list row actions | **Print / Save PDF** (HTML summary — use browser “Save as PDF”) |
| Payment receipt | Auto-opens printable receipt after registering payment |
| Send email / SMS | Delivers payment link; not a PDF attachment |

**Gap:** No `/api/invoices/:id/pdf` (unlike estimates). Contractors must print HTML or screenshot until a PDF route is added.

---

## Contracts

| Surface | Capability |
|---------|------------|
| Estimate kanban → Generate contract | Saves to `contracts` table; **Print contract** in panel (plain text) |
| Contracts list UI | **Missing** — message says “Contracts page” but no `/contracts` route in app |

**Gap:** No contract PDF; no dedicated contracts module in navigation.

---

## Jobs (work orders)

| Surface | Capability |
|---------|------------|
| Job card | **Print work order** — title, client, scope, pricing summary |
| Attached files | PDF uploads stored; not auto-generated work-order PDF |

---

## Clients

| Surface | Capability |
|---------|------------|
| Client details panel | **Print record** — contact, address, activity counts |
| CSV menu | Export spreadsheet (not print) |

---

## Other modules

| Module | Print/PDF |
|--------|-----------|
| Lead inbox | None (by design — operational queue) |
| Calendar | None |
| Reputation | None |
| Website | Public site only (browser print) |
| Subscriptions | Stripe portal / receipts external |
| Bill payments | History export |

---

## Recommended follow-ups (priority)

1. **P1:** Add `/api/invoices/:id/pdf` mirroring estimate PDF (branding + line items).
2. **P1:** Add `/contracts` list page with print/PDF per contract.
3. **P2:** Unified “Print / PDF” action component used on estimates, invoices, jobs, clients.
4. **P2:** Email attachments optional PDF on send estimate/invoice.

---

## Verification

```bash
npx playwright test tests/e2e/contractor-workflows.spec.js --reporter=list
```
