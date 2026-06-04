# Task 4 — Customer & Property Address on Invoices (Complete)

Date: 2026-06-04

## Problem

Invoices showed client name (and sometimes email) only. **Customer address**, **property / job-site address**, and **phone** were missing on PDF, browser print, and emailed invoices.

## Solution

1. **DB snapshot** on `invoices`: `client_phone`, `client_address` (billing), `property_address` (service site).
2. **`src/lib/invoice-party.js`** — format service vs billing addresses from client records, snapshot on save, enrich legacy rows at PDF time.
3. **Save paths** — `POST/PATCH /api/invoices` and estimate→invoice handoff copy party fields when `client_id` is set.
4. **Outputs**
   - **PDF** — two-column “Bill To” / “Job Site” block (name, addresses, phone, email).
   - **Browser print** — same party block in HTML.
   - **Email** — highlighted customer/property/contact section in invoice email HTML.
5. **Invoice list** — cards show customer and job-site lines when present.

## Address mapping

| Label | Source |
| --- | --- |
| Customer address | Client billing address (or service address when billing same as service) |
| Property address | Client service address (street, city, state, ZIP) |
| Phone / email | Client record (email can be overridden on invoice form) |

## Files changed

- `supabase/migrations/20260604140000_invoice_client_addresses.sql`
- `src/lib/invoice-party.js` (new)
- `src/lib/invoice-pdf.js`
- `src/app/api/invoices/route.js`
- `src/app/api/invoices/[id]/route.js`
- `src/app/api/invoices/[id]/pdf/route.js`
- `src/app/api/invoices/[id]/send/route.js`
- `src/lib/invoice-payments.js`
- `src/lib/estimate-approval-handoff.js`
- `src/app/invoices/page.js`
- `src/i18n/locales/en.json`
- `tests/unit/invoice-party.test.mjs` (new)
- `tests/e2e/audit/invoices-module.spec.js`

## Verification

- `npm run db:migrate` — applied `20260604140000_invoice_client_addresses.sql`
- `node --test tests/unit/invoice-party.test.mjs` — 4/4 pass
- `npx playwright test tests/e2e/audit/invoices-module.spec.js` — 12/12 pass

---

**Task 4 complete.** Next: Task 5 (“Powered by FieldBase” footer on invoices).
