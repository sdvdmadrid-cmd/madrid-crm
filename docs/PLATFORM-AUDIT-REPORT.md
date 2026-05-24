# FieldBase Platform Audit & Stabilization Report

**Date:** 2026-05-23  
**Branch:** `fix/platform-audit-stabilization`  
**Priority order:** Stability → Security → Consistency → Scalability → Visual polish  
**Method:** Code review across 12 domains, `npm run build`, Playwright E2E (tenant-isolation, website-funnel, estimate-quote-invoice-flow), production `/api/health` probe

---

## Executive summary

This pass hardens **public estimate access** (JWT-bound tokens, sent-status gate, rate limits), **estimate-builder PATCH** (explicit allowlist, no `tenant_id` mass assignment), and closes a **critical unauthenticated password-reset** vector. Estimate-builder POST/PATCH now validate `client_id` / `quote_id` against the authenticated tenant.

| Area | Status |
|------|--------|
| Critical security (known IDORs) | **Fixed** |
| Production build | **Pass** (`npm run build`) |
| Key E2E | **5/5 pass** |
| Production health | **200 OK** (`fieldbaseapp.net/api/health`) |
| Production-readiness score | **7.5 / 10** — stable for current tenant scale; remaining items are FK hardening on jobs/invoices/contracts and Stripe Connect go-live |

---

## Issues found (by severity)

### Critical (fixed)

| Issue | Location | Risk |
|-------|----------|------|
| Unauthenticated GET estimate by UUID | `src/app/api/estimates/[id]/public/route.js` | Cross-tenant IDOR, PII leak |
| Unauthenticated POST approve/decline | `src/app/api/estimates/[id]/respond/route.js` | Cross-tenant write |
| `...body` mass assignment on estimate-builder PATCH | `src/app/api/estimate-builder/[id]/route.js` | `tenant_id` injection |
| Unauthenticated `updateUserById` via body `token` | `src/app/api/auth/update-password/route.js` | Account takeover |

### High (fixed / mitigated)

| Issue | Location | Status |
|-------|----------|--------|
| estimate-builder POST without tenant client check | `src/app/api/estimate-builder/route.js` | **Fixed** — `assertTenantClient` |
| estimate-builder PATCH FK without tenant check | `src/app/api/estimate-builder/[id]/route.js` | **Fixed** — client + quote validation |
| Client estimate links without token (local WIP) | `src/app/estimates/page.js` | **Reverted** — uses `publicLink` with signed token |

### Medium (open — recommended next sprint)

| Issue | Location | Recommendation |
|-------|----------|----------------|
| Jobs POST/PATCH accept arbitrary `clientId` | `src/app/api/jobs/route.js`, `jobs/[id]/route.js` | Reuse `assertTenantClient` from `src/lib/tenant-fk-validation.js` |
| Invoices POST/PATCH arbitrary `jobId` / `clientId` | `src/app/api/invoices/route.js`, `invoices/[id]/route.js` | Tenant-scoped FK lookups before write |
| Contracts PATCH missing client/job validation | `src/app/api/contracts/[id]/route.js` | Mirror `findClient()` from `contracts/route.js` |
| Email webhook campaign updates without tenant guard | `src/app/api/email/inbound/route.js`, `email/webhooks/events/route.js` | Add `.eq("tenant_id", tenantId)` on writes |
| Website-builder update defense-in-depth | `src/app/api/website-builder/route.js` | Add tenant_id on UPDATE |

### Low

- UI polish backlog (theme consistency, mobile tables) — out of scope per user priority
- `tenant_memberships` for multi-company-per-user — future schema (see `docs/MULTI-TENANT-ARCHITECTURE.md`)

---

## Fixes implemented

### Public estimates (JWT + status gate)

- **`src/lib/estimate-public-access.js`** — HS256 JWT (`purpose: estimate-public`, `sub: estimateId`, 90d TTL), `verifyEstimatePublicAccess`, `buildPublicEstimateLink`, respondable status sets
- **`src/app/api/estimates/[id]/public/route.js`** — requires `?token=`, rate limit, status in `sent|approved|declined|changes_requested`
- **`src/app/api/estimates/[id]/respond/route.js`** — requires `body.token`, same verification + respondable statuses only
- **`src/app/api/estimates/[id]/route.js`** — sends signed link when status → `sent`; `buildUpdateRow` allowlist
- **`src/app/estimate/[id]/page.js`** — reads `token` from query string; blocks load without token

### Estimate builder allowlist + FK validation

- **`src/lib/estimate-builder-records.js`** — `buildEstimateBuilderUpdateRow` / `buildEstimateBuilderInsertRow` (explicit fields only)
- **`src/app/api/estimate-builder/[id]/route.js`** — uses allowlist builder + `assertTenantClient` / `assertTenantQuote`
- **`src/app/api/estimate-builder/route.js`** — POST validates `client_id` belongs to tenant

### Auth hardening

- **`src/app/api/auth/update-password/route.js`** — returns **410 Gone**; use **`/api/auth/reset-password`** (OTP / recovery session) instead

### Shared utilities

- **`src/lib/tenant-fk-validation.js`** — `assertTenantClient`, `assertTenantQuote` for reuse across CRM routes

---

## Architecture notes

1. **Multi-tenant model:** Session carries `tenantDbId` + `role`; APIs use `getAuthenticatedTenantContext` and `.eq("tenant_id", tenantDbId)` except `super_admin`. See `src/lib/tenant.js`, `src/lib/tenant-scope.js`, `src/lib/platform-tenant.js`.
2. **Public document access pattern:** Quotes use opaque `quote_token` in URL path; estimates use **signed JWT** in query (`/estimate/{id}?token=...`) — both rate-limited via `src/lib/rate-limit.js`.
3. **Middleware:** Defers API auth to route handlers; legal acceptance gate applies to selected routes (E2E uses dev-login legal bootstrap).
4. **Stripe:** Connect enabled in prod health (`stripeConnectEnabled: true`); platform vs tenant charges documented in `docs/payments-architecture.md`.
5. **Platform vs contractor branding:** FieldBase shell vs `company_profiles` workspace branding (`docs/MULTI-TENANT-ARCHITECTURE.md`).

---

## QA results

| Check | Result |
|-------|--------|
| `npm run build` | Pass |
| `tenant-isolation.spec.js` | 2/2 pass |
| `website-funnel.spec.js` | 2/2 pass |
| `estimate-quote-invoice-flow.spec.js` | 1/1 pass |
| `GET https://fieldbaseapp.net/api/health` | 200, `status: ok` |

---

## Remaining recommendations

1. **Apply FK validation** to jobs, invoices, contracts PATCH/POST using `tenant-fk-validation.js`.
2. **Harden email webhooks** with tenant-scoped campaign/log updates.
3. **Deploy branch** to Vercel after PR merge; verify `SESSION_SECRET` is set in prod (required for estimate public JWTs).
4. **Stripe Connect go-live:** complete platform profile approval, set live Connect keys, run payment smoke on staging.
5. **Supabase migrations:** ensure latest payments/RLS migrations applied in production (see `docs/PRODUCTION-AUDIT.md`).
6. **Rotate any estimate links** sent before this fix (old UUID-only links are invalid by design).

---

## Manual user actions

- Confirm **Stripe Connect** platform profile and connected accounts for paying tenants
- Set / verify **`SESSION_SECRET`** (and `APP_URL`) in Vercel for signed estimate links
- Review **Supabase RLS** policies in dashboard for new tables
- Do **not** commit `.env`, `dev-admin.cookies`, or `gh-auth-*.txt`

---

## Production-readiness assessment

| Dimension | Score | Notes |
|-----------|-------|-------|
| Stability | 8/10 | Build + E2E green; health endpoint OK |
| Security | 8/10 | Critical IDORs closed; medium FK gaps remain |
| Consistency | 7/10 | Public quote vs estimate patterns aligned |
| Scalability | 6/10 | Rate limits present; webhook idempotency depends on migrations |
| Visual polish | 6/10 | Intentionally deprioritized |

**Overall: 7.5/10 — Ready to merge and deploy** after PR CI, with follow-up ticket for medium FK/webhook items.
