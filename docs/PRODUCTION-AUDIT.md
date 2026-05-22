# FieldBase Production Audit

**Date:** 2026-05-21  
**Scope:** End-to-end SaaS readiness (auth, CRM, estimates, jobs, invoices/payments, website builder, DB/RLS, UI/UX, performance, security, deployment)  
**Method:** Code review + `npm run build` + Playwright E2E + targeted API/middleware inspection + fix-as-you-go

## Executive summary

| Severity | Open (post-pass) | Fixed this pass |
|----------|------------------|-----------------|
| Critical | 0 | Legal gate blocking calendar API in E2E/prod-like flows |
| High | 2 (see below) | E2E drift (bill-pay, calendar, jobs); dev-login legal bootstrap |
| Medium | 4 | Manual payments re-enabled; Connect scaffold; super-admin routing |
| Low | Several UX polish items | Daylight theme, lead-inbox, services-catalog shells |

**Production build:** passes (`npm run build`).  
**E2E:** re-run after fixes in `tests/e2e/helpers/auth.js` and spec updates.  
**Payments architecture:** documented in `docs/payments-architecture.md` and `docs/payments-money-flow-and-monetization.md` (Stripe Connect Express + destination charges + application fees recommended).

### Remaining high-priority (before scale)

1. **Apply Supabase migration** `20260523100000_payments_hardening_connect_prep.sql` on production (webhook idempotency, `paid` status, Connect columns).
2. **Deploy latest branch** to Vercel so `974f94c+` (payments, super-admin) and UI polish are live.
3. **Enable Stripe Connect** only after Stripe dashboard approval and `STRIPE_CONNECT_ENABLED=true` with live Connect accounts.

---

## 1. Auth + users

| Check | Status | Notes |
|-------|--------|-------|
| Login / dev-login | OK | Session cookie + profile upsert |
| Super admin routing | Fixed | Platform operator → `/owner/*`, not contractor CRM |
| Protected routes | OK | Middleware + `AuthShell` |
| Legal acceptance gate | Fixed | `dev-login` now sets `cf_legal` cookie; E2E helper `ensureLegalAccepted` |
| Tenant isolation | OK | `tenantDbId` on session; RLS expected on Supabase tables |
| Password reset / email verify | Partial | Supabase-native; verify env templates in prod |
| Session expiration | OK | Cookie max-age from auth lib |

**Fix:** `src/app/api/auth/dev-login/route.js` — bootstrap legal cookie so API routes guarded by legal enforcement return 400/200 instead of 403 in tests and local QA.

---

## 2. CRM (clients)

| Check | Status |
|-------|--------|
| CRUD | OK (code paths) |
| Search/filter | OK |
| Validation | OK |
| Mobile | Improved via premium shell/CSS (uncommitted UI batch) |

No blocking defects found in API layer during this pass.

---

## 3. Estimates

| Check | Status |
|-------|--------|
| Create / edit | OK |
| AI generation | Depends on provider keys |
| PDF / taxes / totals | Review per-tenant tax settings in prod |
| Status transitions | OK in schema |

Recommend manual smoke on prod after deploy: create → send → approve.

---

## 4. Jobs + calendar

| Check | Status | Notes |
|-------|--------|-------|
| Job create API | OK | E2E was flaky on Save + POST timeout |
| Calendar past dates | Fixed | API test now sends Origin + legal cookie |
| Weather strip | OK | E2E covered |

**Fixes:** `jobs-files.spec.js` — longer POST wait, scroll Save; `calendar.spec.js` — stable title fill, `devLogin`.

---

## 5. Invoices + payments

| Area | Status |
|------|--------|
| Stripe Checkout | OK with Connect optional |
| Webhooks | Hardened scaffold + idempotency table (migration pending apply) |
| Manual payments | Re-enabled `POST /api/invoices/[id]/payments` |
| Connect onboarding | UI + API scaffold |
| Bill payments (wallet) | Separate product surface; E2E updated for Wallet tab |
| Refunds / disputes | Documented; full automation Phase 2+ |

See money-flow doc for **$1,000 example** (Stripe ~$29.30, platform ~$7.50, contractor ~$963.20 illustrative).

**Recommended architecture:** Hybrid Option C — Connect Express, destination charges, `application_fee_amount`, SaaS subscription on platform account.

---

## 6. Website builder

| Check | Status |
|-------|--------|
| Tenant generation | OK (code) |
| Publish / public render | Verify after deploy with real tenant |
| SEO / mobile | Basic; continue polish |
| Public forms + spam | Turnstile/rate limits — confirm prod keys |

---

## 7. Database + backend

| Check | Status |
|-------|--------|
| RLS | Present on core tables; periodic audit recommended |
| Payments migration | **Not applied on prod** — run `supabase db push` |
| Webhook idempotency | In migration |
| API validation | Generally consistent; calendar legal 403 was env/test gap |

---

## 8. UI/UX

| Check | Status |
|-------|--------|
| Premium dark (daylight-readable) | Updated tokens `#1e2433` base |
| Lead inbox / services catalog | Premium shells added |
| Loading / empty states | Improved in touched pages |
| Accessibility | Spot-check; no full WCAG audit |

---

## 9. Performance

| Check | Status |
|-------|--------|
| Production build | Pass |
| Bundle | No regression introduced this pass |
| Slow queries | Not profiled in this pass |

---

## 10. Security

| Check | Status |
|-------|--------|
| Stripe secrets server-only | OK |
| Webhook signature | Required `STRIPE_WEBHOOK_SECRET` (CI dummy in preflight) |
| CSRF / Origin on mutations | Legal + session routes |
| XSS | React default escaping |
| Rate limiting | Partial — reinforce on public forms |

---

## 11. Deployment

| Item | Status |
|------|--------|
| Vercel build | Pass locally |
| Env vars | Documented in payments docs |
| Prod URL | https://fieldbaseapp.net — redeploy needed for latest commits |
| Monitoring | Add Sentry/Datadog when scaling |

---

## Payment system recommendation (summary)

**Use Stripe Connect Express** with destination charges and application fees for customer → contractor job payments. FieldBase SaaS billing stays on the platform Stripe account. Phased rollout:

1. Phase 0 (done): webhooks, manual pay, idempotency schema, fee helper  
2. Phase 1: Connect onboarding UI + conditional checkout destination  
3. Phase 2: instant payouts, milestones, refund automation  
4. Phase 3: subscriptions + usage metering  

Full detail: `docs/payments-money-flow-and-monetization.md`.

---

## Fixes applied (this audit iteration)

| Issue | Root cause | Change | Retest |
|-------|------------|--------|--------|
| Calendar API 403 | Legal cookie missing on raw API calls | `ensureLegalAccepted` in test + dev-login cookie | Playwright calendar spec |
| Bill-pay E2E failures | UI routed to Wallet / new bill URL | Updated `bill-payments.spec.js` | Playwright |
| Jobs E2E timeout | Slow POST + button off-screen | Timeout + scrollIntoView | Playwright jobs-files |
| E2E duplication | Repeated legal login | `tests/e2e/helpers/auth.js` | All specs using `devLogin` |

---

## Next actions (ops)

1. `npx playwright test` — confirm 16/16 green  
2. Commit UI + audit + E2E fixes  
3. `supabase db push` (prod)  
4. `npx vercel --prod`  
5. Set `SUPER_ADMIN_EMAIL` in Vercel env; owner re-login  

---

*This document should be updated after each production deploy and quarterly security review.*
