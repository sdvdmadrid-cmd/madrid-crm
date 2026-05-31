# Estimate PDF improvements (feature branch)

**Branch:** `feature/estimate-pdf-professional`  
**Scope:** Estimate system + estimate PDF only (no invoices, CRM, calendar, etc.)

---

## Summary

Professional contractor-style estimate PDF comparable to Jobber/QuickBooks: branded header, structured sections, scope bullets, terms, payment schedule, and client acceptance block. Customer-facing PDFs no longer show internal **Draft** status.

---

## Changes

### PDF layout (`src/lib/estimate-pdf.js`)

- Letter-size layout with branded logo + company block
- Contact row: phone, email, website, business address (from company profile)
- **Prepared for** / **Project** two-column client block
- Styled line-item table (description, qty, rate, amount)
- Right-aligned totals with emphasized total
- **Scope of Work** with paragraph + bullet list support
- **Payment Schedule** (default 50% deposit / balance on completion)
- **Terms & Conditions** (deposit, payment, change orders, validity + optional `legal_footer`)
- **Client Acceptance** (signature, date, printed name lines)
- Footer with company contact (no generic “Generated on” banner)
- Estimate #, date, and **valid through** — status hidden on PDF

### Branding (`src/lib/estimate-pdf-branding.js`)

- Loads full `company_profiles` row + tenant business email from `profiles`
- Used by auth PDF, public PDF, and estimate email attachments

### Service line labels

- `serviceTitle` stored in estimate notes JSON
- Auto-derived from first line of scope text on save
- Replaces **Base Price** on PDF (`src/lib/estimate-pdf-content.js`)

### Estimate editor (`src/app/estimates/new/page.js`)

- Sends `serviceTitle` on save
- Hint: first line → PDF service name; bullets for scope

### API

- `POST/PATCH /api/estimates` persist `serviceTitle` in notes blob

### Tests

- `tests/unit/estimate-pdf-content.test.mjs`

---

## Configure branding (contractor)

Set in **Owner/Platform settings** or company profile:

- Company name, logo, phone, website, business address
- `legal_footer` appended under Terms & Conditions

Business email comes from the tenant’s primary `profiles` row.

---

## Verify locally

```powershell
npm run dev
# Create/save estimate → Print/Download PDF from kanban or editor
npx playwright test tests/e2e/audit/estimates-module.spec.js
node --test tests/unit/estimate-pdf-content.test.mjs
```
