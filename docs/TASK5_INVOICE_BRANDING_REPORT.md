# Task 5 — “Powered by FieldBase” Invoice Footer (Complete)

Date: 2026-06-04

## Problem

Customer-facing invoices (PDF, browser print, email) did not show **Powered by FieldBase** branding in the footer.

## Solution

1. **`src/lib/fieldbase-document-branding.js`** (client-safe) — shared label, marketing URL (`https://fieldbaseapp.net`), HTML block, plain-text email suffix.
2. **Invoice PDF** — footer shows generated date, contractor name, and a **clickable** “Powered by FieldBase” link (`renderInvoicePdfFooter` in `invoice-pdf.js`).
3. **Browser print** — appends the same HTML footer block on printable invoices.
4. **Invoice email** — HTML + plain-text footers include Powered by FieldBase.

## Files changed

- `src/lib/fieldbase-document-branding.js` (new)
- `src/lib/invoice-pdf.js`
- `src/app/invoices/page.js`
- `src/app/api/invoices/[id]/send/route.js`
- `src/i18n/locales/en.json`
- `tests/unit/fieldbase-document-branding.test.mjs` (new)
- `tests/e2e/audit/invoices-module.spec.js`

## Verification

- `node --test tests/unit/fieldbase-document-branding.test.mjs` — 3/3 pass
- `npx playwright test tests/e2e/audit/invoices-module.spec.js` — 12/12 pass (PDF asserts link annotation to fieldbaseapp.net)

---

**Task 5 complete.** Next: Task 6 (public website link 404/401 fixes).
