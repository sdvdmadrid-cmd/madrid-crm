# FieldBase Stabilization Audit — June 2026

This document summarizes the production-readiness audit. **No major modules** were added in this phase; focus is quality, performance, security, and workflow validation.

## Scope reviewed

| Area | Count | Notes |
|------|-------|-------|
| App pages | ~70 routes | See `src/app/**/page.js` |
| API routes | 214 handlers | Tenant-scoped via `getAuthenticatedTenantContext` |
| Forms / modals | 15+ critical surfaces | Client + API validation |
| Database | Core + payroll + job costing migrations | RLS via `can_access_tenant` / `safe_can_access_tenant` |

## Issues found & remediated

### Bugs & UX
- **Executive P&L** queried non-existent `invoices.total` / `paid_at` — fixed with `invoiceAmount()` / `invoicePaidDate()` helpers.
- **Sidebar** missing `insights` icon — added chart icon paths.
- **Dashboard** silent metrics failure — error banner with `data-testid="dashboard-metrics-error"`.
- **Lead inbox** empty flash on load — initial `loading: true`.
- **Equipment** empty name accepted — client + server validation.
- **Platform docs** listed `/jobs/calendar` (no page) — removed; scheduling at `/calendar`.

### AI safety
- High-impact tools require `confirmed: true` or UI **Confirm** plan (`ai_tool` type).
- All tool executions write `audit_logs` action `ai.tool.<name>`.
- `createEstimate` confirm only when `send: true`.

### Performance
- **Dashboard metrics**: 45s in-memory cache (existing).
- **Executive financial API**: 60s tenant cache + `Cache-Control: private, max-age=30`.

### Reporting (consolidation, not new module)
- **`/reports`** hub links to Business P&L, invoice summary, payroll reports, jobs, equipment.

## Known remaining items

| Item | Severity | Notes |
|------|----------|-------|
| Bill-pay UI/API | Low | Middleware redirects; pages exist but disabled for contractors |
| `confirmPlan` client replay | Medium | Website/CRM only; ops tools use new `ai_tool` confirm path |
| Places API auth | Medium | Session-only vs full tenant context |
| Real OCR receipts | Low | Text-parse stub |
| Profitability charts over time | Low | Reporting is tabular |
| Multi-tenant `tenant_members` | Future | Single `profiles.tenant_id` today |

## Workflow validation

Automated e2e coverage:

- `tests/e2e/audit/payroll-module.spec.js`
- `tests/e2e/audit/contractor-financial.spec.js`
- `tests/e2e/audit/contractor-workflows.spec.js`

Manual checklist: **`docs/QA-CHECKLIST.md`**

## Security summary

- Private APIs: session + Supabase user resolution.
- Mutations: CSRF / same-origin guards.
- AI: tenant-scoped `supabaseAdmin` queries; confirmation for financial actions.
- Audit: `audit_logs` for AI tools; payroll has `logPayrollAudit` on service routes.

## Run before release

```bash
node --test tests/unit/*.test.mjs
npx playwright test tests/e2e/audit/
```
