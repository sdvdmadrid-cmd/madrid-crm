# Release Checklist (Staging/Production)

## 1) Environment and secrets

- [ ] Configure `NEXT_PUBLIC_SUPABASE_URL`.
- [ ] Configure `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- [ ] Configure `SUPABASE_SERVICE_ROLE_KEY`.
- [ ] Configure `SESSION_SECRET` (must not use a default or weak value in production).
- [ ] Configure `APP_BASE_URL` to the public HTTPS URL.
- [ ] Configure `APP_URL` to the public HTTPS URL.
- [ ] Configure `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` if Stripe checkout or Bill Payments is enabled.
- [ ] Configure `STRIPE_SECRET_KEY` if Stripe checkout or Bill Payments is enabled.
- [ ] Configure `STRIPE_WEBHOOK_SECRET` if Stripe webhooks are enabled.
- [ ] Configure `BILL_AUTOPAY_CRON_SECRET` if Bill Payments AutoPay is enabled.
- [ ] Configure `EMAIL_PROVIDER`.
- [ ] Configure `EMAIL_FROM`.
- [ ] Configure `EMAIL_WEBHOOK_SECRET` when email webhooks are enabled.
- [ ] Configure `RESEND_API_KEY` when `EMAIL_PROVIDER=resend`.
- [ ] Configure `PLAID_CLIENT_ID` and `PLAID_CLIENT_SECRET` when Plaid bank linking is enabled.
- [ ] Configure `PLAID_ENV` when Plaid bank linking is enabled.
- [ ] Configure `OPENAI_API_KEY` when AI description endpoints are enabled.
- [ ] Configure `GOOGLE_PLACES_API_KEY` when Places autocomplete/details endpoints are enabled.
- [ ] Configure `SUPER_ADMIN_EMAIL` if the production super-admin bootstrap flow depends on email matching.
- [ ] Set `DEV_LOGIN_ENABLED=false` in production.
- [ ] Set `NEXT_PUBLIC_DEV_LOGIN_ENABLED=false` in production.
- [ ] Set `ALLOW_INSECURE_DEV_WEBHOOKS=false` in production.
- [ ] Verify Supabase connection/runtime settings for target environment.
- [ ] Verify remote migration access includes `SUPABASE_DB_PASSWORD` when using `npx supabase db push` from a workstation or CI runner. This is not a Vercel runtime variable.

## 2) Code quality and build

- [ ] Run `npm run lint` and confirm no errors.
- [ ] Run `npm run build` and confirm successful build.
- [ ] Run `npm run dev:doctor:full` in pre-release validation.

## 3) Runtime smoke checks

- [ ] Verify `/api/health` returns 200.
- [ ] Verify auth flow: register/login/me works.
- [ ] Verify key pages return 200: `/`, `/jobs`, `/invoices`, `/clients`, `/calendar`, `/platform`, `/bill-payments`.
- [ ] Verify tenant-protected APIs return expected auth behavior.

## 4) Stripe end-to-end

- [ ] Create an invoice and call `POST /api/invoices/[id]/checkout`.
- [ ] Open the returned checkout URL and complete payment in test mode.
- [ ] Send signed webhook to `POST /api/payments/webhooks/stripe`.
- [ ] Confirm invoice updates: `payments[]`, `paidAmount`, `balanceDue`, `status`.
- [ ] Re-send same event and confirm idempotency (payment not duplicated).

## 5) Bill Payments end-to-end

- [ ] Apply `supabase/migrations/20260419173000_create_bill_payments_feature.sql` to the target database.
- [ ] Create a bill provider match or custom provider entry from `/bill-payments`.
- [ ] Save a test payment method with Stripe Elements.
- [ ] Pay one bill manually and confirm transaction history updates.
- [ ] Re-send matching `payment_intent.*` webhook events and confirm bill/transaction state remains consistent.
- [ ] Run `npm run bill:autopay` with `BILL_AUTOPAY_CRON_SECRET` configured.
- [ ] Confirm AutoPay reminders and due payments are created only once per intended cycle.

## 6) Operational checks

- [ ] Confirm logs contain no unhandled errors during smoke test window.
- [ ] Confirm app process and Supabase connectivity are stable over at least 10 minutes.
- [ ] Confirm backup/restore plan is available for Supabase/Postgres data.
- [ ] Confirm the external scheduler can call `POST /api/bill-payments/autopay/process` with `x-cron-secret`.

## 7) Security gate (must pass)

- [ ] Verify unauthenticated access to protected pages redirects to `/login`.
- [ ] Verify tenant/user isolation with A/B test: user B cannot view or edit user A data.
- [ ] Verify input sanitization blocks unsafe payloads (for example `<script>`, `javascript:`, SQL-like injection strings).
- [ ] Verify protected APIs return 401/403 as expected when auth is missing or role is insufficient.
- [ ] Confirm `SESSION_SECRET` is non-default in target environment.
- [ ] Confirm no leaked keys/secrets in client bundle or logs.

## 8) Go/No-Go gate

- [ ] All checks above pass.
- [ ] Known issues documented with owner and ETA.
- [ ] Team approval to proceed.
