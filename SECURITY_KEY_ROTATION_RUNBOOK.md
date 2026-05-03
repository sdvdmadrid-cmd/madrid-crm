# FieldBase Key Rotation Runbook

Use this runbook to rotate secrets safely with minimal downtime.

## Scope

Rotate these first:

1. STRIPE_SECRET_KEY
2. STRIPE_WEBHOOK_SECRET
3. RESEND_API_KEY
4. OPENAI_API_KEY
5. SESSION_SECRET
6. SUPABASE_SERVICE_ROLE_KEY

## Pre-Rotation Checklist

1. Ensure local env is aligned with [`.env.local.example`](.env.local.example).
2. Open [`.env.local`](.env.local) and prepare new values.
3. Keep current app running in a separate terminal for smoke tests.
4. Confirm health endpoint currently returns 200.

## Rotation Order (Safe Sequence)

1. Rotate `SESSION_SECRET` first only if you are ready to invalidate current sessions.
2. Rotate `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` together.
3. Rotate `RESEND_API_KEY`.
4. Rotate `OPENAI_API_KEY`.
5. Rotate `SUPABASE_SERVICE_ROLE_KEY`.

## Required Files

1. [`.env.local`](.env.local)
2. [`.env.local.example`](.env.local.example)

## Post-Rotation Validation

Run these commands:

```bash
npm run dev:status
npm run dev:doctor
```

Then validate functional paths:

1. Login works.
2. Protected pages reject unauthenticated access.
3. Estimate flow works.
4. Stripe checkout endpoint responds correctly:
   - `POST /api/invoices/[id]/checkout`
5. Stripe webhook signature verification still works:
   - `POST /api/payments/webhooks/stripe`
6. Email sending path works from app flows that use [src/lib/email.js](src/lib/email.js).
7. AI generation endpoint still responds.

## Stripe Webhook Rebind

If using Stripe CLI in local:

```bash
stripe listen --forward-to http://localhost:3000/api/payments/webhooks/stripe
```

Copy new webhook secret into `STRIPE_WEBHOOK_SECRET`.

## Session Impact Note

Changing `SESSION_SECRET` invalidates all active sessions. Users will need to log in again.

## Emergency Rollback

1. Revert only the failing key in [`.env.local`](.env.local).
2. Restart app services.
3. Re-test the failing integration.
4. Investigate and retry rotation in isolation.

## Hard Rules

1. Never put private keys in `NEXT_PUBLIC_*`.
2. Never commit real keys to git.
3. Never use `SUPABASE_SERVICE_ROLE_KEY` in browser code.
4. Always rotate immediately after suspected exposure.
