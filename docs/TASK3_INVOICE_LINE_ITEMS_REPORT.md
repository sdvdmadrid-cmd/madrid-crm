# Task 3 — Invoice Line Items Bug (Complete)

Date: 2026-06-04

## Problem

- Invoice form only had a hidden-style textarea for “service lines,” not a real **Line items** section.
- Print/PDF could show **Line items** with **$0.00** rows when `items` held empty or legacy `{ label, amount: "0" }` rows.
- Line items used inconsistent fields (`label` vs `description`, flat `amount` vs qty × unit price).

## Root cause

1. UI stored line items as free-text (`lineItemsText`) instead of structured rows.
2. PDF/print rendered any non-empty `items` array, including zero-value placeholders.
3. `unitPrice` parsing treated missing values as `0`, blocking legacy `amount`-only rows from splitting correctly.

## Solution

1. **`InvoiceLineItemsEditor`** — visible table: description, quantity, unit price, line total, add/remove rows.
2. **`src/lib/invoice-line-items.js`** — normalize, sum, and filter rows for save/display/PDF.
3. **Auto total** — line items subtotal syncs the invoice **Amount** field when lines have value.
4. **API** — `POST/PATCH` invoices sanitize `lineItems` before persisting.
5. **PDF & browser print** — line items table only when meaningful rows exist; qty × rate × amount columns.

## Files changed

- `src/lib/invoice-line-items.js` (new)
- `src/components/invoices/InvoiceLineItemsEditor.jsx` (new)
- `src/app/invoices/page.js`
- `src/app/invoices/invoices.module.css`
- `src/lib/invoice-pdf.js`
- `src/app/api/invoices/route.js`
- `src/app/api/invoices/[id]/route.js`
- `src/i18n/locales/en.json`
- `tests/unit/invoice-line-items.test.mjs` (new)
- `tests/e2e/audit/invoices-module.spec.js`

## Verification

- `node --test tests/unit/invoice-line-items.test.mjs` — 5/5 pass
- `npx playwright test tests/e2e/audit/invoices-module.spec.js` — 11/11 pass

---

**Task 3 complete.** Next: Task 4 (customer & property address on invoices).
