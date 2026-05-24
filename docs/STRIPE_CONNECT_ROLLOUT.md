# Stripe Connect rollout — deployment-ready (paused until legal/banking)

FieldBase Connect infrastructure is **implemented and production-safe** but **not live** until business setup completes. There are **no fake activation flags** in code — only real Stripe account capabilities and env toggles.

## Current business status (operator)

- FieldBaseApp registered with State of Illinois
- Waiting on **EIN**
- Waiting on **business banking**
- Then: **Stripe platform Connect verification** (questionnaire + approval)
- Then: **live Connect activation** in Vercel

## Environment modes (test vs live)

| Environment | `STRIPE_SECRET_KEY` | `STRIPE_CONNECT_ENABLED` | Contractor checkout |
|---------------|---------------------|---------------------------|-------------------|
| Local dev | `sk_test_…` | `false` (default) | Platform account (no Connect split) |
| Vercel Preview | `sk_test_…` | `false` | Same |
| Vercel Production (now) | `sk_live_…` | **`false`** | Platform account — **do not enable Connect flag yet** |
| Production (go-live) | `sk_live_…` | `true` **after** Stripe Dashboard Connect = Enabled | Destination charges + Express onboarding |

Mode is determined by **key prefix**, not a separate `STRIPE_MODE` variable. Never mix test keys in Production.

## Rollout switch (single env var)

`STRIPE_CONNECT_ENABLED=false` (required now)

- `paymentsMode`: `platform`
- Invoice Checkout uses the **platform** Stripe account
- Contractor Connect UI shows **coming soon** (`enabled: false` in status API)
- `/api/payments/connect/onboard` returns **503** `connect_not_enabled`

`STRIPE_CONNECT_ENABLED=true` (only after Stripe approves platform Connect)

- `paymentsMode`: `connect`
- Checkout requires contractor **`onboarded`** (`charges_enabled` + `payouts_enabled` from webhooks)
- Onboarding creates Express accounts via Account Links
- Platform fee via `FIELDBASE_PLATFORM_FEE_BPS` (default 75 = 0.75%)

**Do not** set `true` before Stripe Dashboard shows Connect **Enabled** — contractors will see onboarding errors (`platform_connect_not_enabled`).

## Activation truth (no hacks)

| State | Source |
|-------|--------|
| Contractor “Connected” | DB + Stripe webhook `account.updated` — both `charges_enabled` and `payouts_enabled` |
| Platform Connect ready | Stripe Dashboard (manual verification) |
| App Connect feature on | `STRIPE_CONNECT_ENABLED=true` in Vercel Production + redeploy |

## API error codes (stable)

| Code | HTTP | Meaning |
|------|------|---------|
| `connect_not_enabled` | 503 | Flag off — rollout paused |
| `platform_connect_not_enabled` | 503 | Flag on but Stripe platform Connect not registered |
| `connect_not_configured` | 400 | No Express account yet |
| `connect_payout_required` | 400 | Connect mode — contractor must finish onboarding before Checkout |

## Go-live checklist (when legal/banking ready)

1. Obtain **EIN** and open **business bank account**
2. Complete [Stripe Connect platform signup](https://dashboard.stripe.com/connect) using `docs/STRIPE_CONNECT_APPLICATION_DRAFT.md`
3. Confirm Connect **Enabled** in Stripe Dashboard (live account)
4. Vercel Production: `STRIPE_CONNECT_ENABLED=true` → redeploy
5. Run `npm run deploy:audit` and test one contractor onboarding in **test** mode first
6. Verify webhook receives `account.updated` on `/api/payments/webhooks/stripe`
7. Test invoice Checkout end-to-end (destination charge + application fee)

## Related docs

- `docs/STRIPE_CONNECT_APPROVAL.md` — who approves what
- `docs/STRIPE_CONNECT_APPLICATION_DRAFT.md` — Stripe questionnaire copy
- `VERCEL_PRODUCTION_ENV.md` — env inventory
- `docs/payments-architecture.md` — technical architecture
