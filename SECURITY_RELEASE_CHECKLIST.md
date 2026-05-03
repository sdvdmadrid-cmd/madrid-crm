# Security Release Checklist

Run this checklist before every production deployment.

---

## 1. Environment Variables

- [ ] `SESSION_SECRET` is set, ≥ 32 chars, randomly generated (not a default/placeholder)
- [ ] `APP_BASE_URL` is set to the canonical production URL (e.g. `https://yourapp.com`) — required for CSRF origin validation
- [ ] `NEXT_PUBLIC_SUPABASE_URL` is set
- [ ] `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is set
- [ ] `SUPABASE_SERVICE_ROLE_KEY` is set and NOT exposed to the browser
- [ ] `CRON_SECRET` is set, ≥ 32 chars, unique per environment
- [ ] `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` are production keys (not `sk_test_`)
- [ ] `PLAID_CLIENT_ID` / `PLAID_SECRET` are production credentials
- [ ] `ALLOW_INSECURE_DEV_WEBHOOKS` is **absent or empty** in production (never `"true"` or `"dev-local-only"`)

---

## 2. Authentication & Authorization

- [ ] All API routes (`src/app/api/**`) use `getAuthenticatedTenantContext`, never the old sync `getTenantContext`
- [ ] Every route that returns user data filters by `tenant_id` (no cross-tenant data leak)
- [ ] Admin routes under `/api/admin/**` verify `role === "super_admin"` or equivalent
- [ ] Public routes (e.g. `/api/site/[slug]/contact`) do **not** expose internal IDs or tenant data

---

## 3. CSRF Protection

- [ ] All PATCH / DELETE routes import and call `enforceSameOriginForMutation(request)` as the first statement
- [ ] Routes covered: `clients/[id]`, `invoices/[id]`, `estimate-builder/[id]`, `appointments/[id]`, `jobs/[id]`, `services-catalog/[id]`, `services-catalog/preferences`, `bill-payments/bills/[id]`, `bill-payments/payment-methods/[id]`, `contracts/[id]`, `company-profile`, `notifications`, `estimate-requests`, `dashboard-metrics`, `revenue-dashboard`
- [ ] Security preflight CSRF tests pass: `powershell -ExecutionPolicy Bypass -File .\scripts\security-preflight.ps1 -BaseUrl "https://<prod-url>"`

---

## 4. Input Validation & Sanitization

- [ ] All API routes that accept body data run `sanitizePayloadDeep()` or explicit field allow-listing
- [ ] No raw `body[field]` written directly to DB without sanitization
- [ ] Public forms have honeypot field + minimum form-fill time check (`MIN_FORM_FILL_MS`)
- [ ] URL parameters (UUIDs) are validated with `normalizeUuid()` before DB queries

---

## 5. Rate Limiting

- [ ] Auth endpoints (`/api/auth/**`) are rate-limited
- [ ] Public quote/lead endpoints are rate-limited (IP + slug limits)
- [ ] Limits are appropriate for production traffic (not dev-only generous values)

---

## 6. XSS & Content Security

- [ ] No `innerHTML`, `document.write`, or `dangerouslySetInnerHTML` with unsanitized user data
- [ ] Invoice receipt popup uses `escapeHtml()` for all user-supplied data
- [ ] CSP header is present in `next.config.mjs` and does not include `unsafe-eval` or `unsafe-inline` for scripts unnecessarily

---

## 7. Secrets & Timing Attacks

- [ ] Cron secret comparison uses `timingSafeEqualString` (not `===` or `!==`)
- [ ] Webhook signature verification uses timing-safe comparison
- [ ] No secret values logged to console or returned in API responses

---

## 8. Database / Supabase

- [ ] All pending migrations have been applied: `npx supabase@2.95.3 db push --db-url <PROD_DB_URL>`
- [ ] Row Level Security (RLS) is enabled on all tables containing user data
- [ ] `can_access_tenant(tenant_id)` policies are active for tenant-scoped tables
- [ ] Service role key is only used server-side (never in client bundle)

---

## 9. Dependency Audit

- [ ] Run `npm audit --audit-level=high` — zero high/critical vulnerabilities
- [ ] No dependencies pinned to a known-vulnerable version

---

## 10. Pre-Deploy Automated Tests

```powershell
# Run full security preflight against staging/production URL
powershell -ExecutionPolicy Bypass -File .\scripts\security-preflight.ps1 -BaseUrl "https://<your-domain>"
```

Expected: **0 failures** before merging to main / deploying.

---

## Sign-off

| Check | Verified by | Date |
|-------|------------|------|
| Env vars | | |
| Auth/RBAC | | |
| CSRF coverage | | |
| Preflight 0 failures | | |
| Migrations applied | | |
| npm audit clean | | |
