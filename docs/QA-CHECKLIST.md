# FieldBase QA Checklist — Production Readiness

Use this checklist before each release. Run automated tests first, then manual passes.

## Automated tests

```bash
node --test tests/unit/*.test.mjs
npx playwright test tests/e2e/audit/payroll-module.spec.js
npx playwright test tests/e2e/audit/contractor-financial.spec.js
npx playwright test tests/e2e/audit/contractor-workflows.spec.js
```

| Suite | Expected |
|-------|----------|
| Unit (payroll, job costing, project P&L) | All pass |
| Payroll e2e | 3/3 |
| Contractor financial e2e | 3/3 |
| Contractor workflows e2e | All pass |

---

## 1. Authentication & roles

- [ ] Login / logout / session refresh
- [ ] Dev login restricted to non-production
- [ ] Contractor role: CRM, jobs, invoices, payroll, reports (no owner admin)
- [ ] Super admin: owner overview only
- [ ] Employee portal (`/portal/payroll`) — own pay stubs only
- [ ] Legal acceptance gate before dashboard

## 2. Lead → Estimate → Job → Invoice → Payment

- [ ] Create client
- [ ] Create estimate (AI or manual)
- [ ] Send estimate / public quote link
- [ ] Convert estimate to job
- [ ] Schedule appointment / calendar entry
- [ ] Add job expenses (material, vendor, fuel, sub)
- [ ] Job financial dashboard: P&L, est vs actual
- [ ] Create invoice (progress / final / change order)
- [ ] Invoice PDF / email send
- [ ] Stripe payment or manual paid status
- [ ] Revenue appears on Business P&L and invoice summary

## 3. Employee → Time → Payroll

- [ ] Add payroll employee (W-2, state, direct deposit)
- [ ] Time entries (regular + OT)
- [ ] Create pay run → calculate (Pub 15-T federal, state tax)
- [ ] Approve pay run
- [ ] ACH batch: draft → review → approve → export
- [ ] Payroll correction / void
- [ ] Employee portal: stubs, W-2 download
- [ ] Payroll expense hits job labor / P&L when job-linked

## 4. Expense → Job cost → P&L

- [ ] Add expense per category on job financial page
- [ ] Upload receipt → linked expense
- [ ] Job cost totals refresh on jobs list
- [ ] Executive dashboard: expenses this month
- [ ] Losing jobs list accurate

## 5. Equipment

- [ ] Add equipment to inventory
- [ ] Assign to job with hours
- [ ] Equipment cost in job P&L

## 6. AI assistant

- [ ] Read-only queries (profit, labor by project, outstanding invoices)
- [ ] High-impact actions require **Confirm** (invoice, send estimate, payroll run)
- [ ] Audit log entries for `ai.tool.*` in `audit_logs`
- [ ] No cross-tenant data in responses

## 7. Reports hub (`/reports`)

- [ ] Business P&L loads without error
- [ ] Invoice summary loads
- [ ] Payroll reports load
- [ ] Job financial links work

## 8. UI / UX

- [ ] Mobile: sidebar, jobs list, invoice form, financial dashboard
- [ ] Loading states on dashboard, lead inbox, financial pages
- [ ] Error messages visible (dashboard metrics, API failures)
- [ ] No broken sidebar icons (insights, payroll, equipment)
- [ ] Broken links scan: all AuthShell `href`s resolve

## 9. Security

- [ ] Private APIs return 401 without session
- [ ] Tenant isolation: cannot access other tenant’s job/invoice by ID
- [ ] CSRF / same-origin on mutations
- [ ] RLS enabled on tenant tables (Supabase)
- [ ] Service role only on server; no service key in client
- [ ] Webhook routes use secrets, not public

## 10. Performance

- [ ] Dashboard metrics cached (~45s TTL)
- [ ] Executive financial API responds &lt; 3s typical tenant
- [ ] Jobs list pagination with reasonable limit
- [ ] No full-table scans on invoices without tenant filter

---

## Sign-off

| Role | Name | Date | Notes |
|------|------|------|-------|
| Engineering | | | |
| Product | | | |
