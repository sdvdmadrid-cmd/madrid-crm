# Vercel Production Environment

This file is the deploy-ready environment inventory for production.

## Must Have For This App

Set these in the Vercel Production environment before deploy:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SESSION_SECRET`
- `APP_URL`
- `APP_BASE_URL`

## Must Have If Stripe Or Bill Payments Is Live

- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `BILL_AUTOPAY_CRON_SECRET`

These are required because the codebase includes live invoice checkout and Bill Payments flows.

## Must Have If Transactional Email Is Live

- `EMAIL_PROVIDER`
- `EMAIL_FROM`
- `EMAIL_WEBHOOK_SECRET`

If `EMAIL_PROVIDER=resend`, also set:

- `RESEND_API_KEY`

Production guardrails already enforced in code:

- `EMAIL_FROM` cannot use `example.com`
- `EMAIL_FROM` cannot use `resend.dev`

## Must Have If Plaid Linking Is Live

- `PLAID_CLIENT_ID`
- `PLAID_CLIENT_SECRET`
- `PLAID_ENV`

Plaid is only required if the bank-linking flow is enabled for Bill Payments.

## Must Have If Optional Endpoints Are Used

- `OPENAI_API_KEY`
- `GOOGLE_PLACES_API_KEY`

`OPENAI_API_KEY` is used by AI description endpoints.

`GOOGLE_PLACES_API_KEY` is used by Places autocomplete and details endpoints.

## Recommended Operational Variables

- `SUPER_ADMIN_EMAIL`

This is not universally required for startup, but it should be set if production super-admin bootstrap or privilege assignment depends on email matching.

## Production Flags That Must Be Locked Down

Set these explicitly in Vercel Production:

- `DEV_LOGIN_ENABLED=false`
- `NEXT_PUBLIC_DEV_LOGIN_ENABLED=false`
- `ALLOW_INSECURE_DEV_WEBHOOKS=false`

## Non-Vercel Variable

This is needed for remote Supabase migration pushes from local/CI, not for Vercel runtime:

- `SUPABASE_DB_PASSWORD`

## Verification Status

Verified from the current codebase:

- Secrets are consumed through environment variables, not hardcoded in active source files.
- No `.env` files were found in the workspace.
- No real hardcoded secrets were found in `src` or `scripts` during the repository scan.
- Production checks already enforce non-local `APP_URL` and `APP_BASE_URL`.
- Production checks already enforce dev-login flags disabled.

Notes from the scan:

- Default placeholder values still exist for development-only fallbacks such as `no-reply@example.com` and local dev-login emails. These are not real secrets.
- Generated artifacts under `.next`, `node_modules`, and temporary probe files are not the source of truth for deployment configuration.

## Immediate Deploy Set

If you want the smallest safe production set for the current app as checked today, configure at least:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SESSION_SECRET`
- `APP_URL`
- `APP_BASE_URL`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `BILL_AUTOPAY_CRON_SECRET`
- `EMAIL_PROVIDER`
- `EMAIL_FROM`
- `EMAIL_WEBHOOK_SECRET`
- `RESEND_API_KEY` if using Resend
- `DEV_LOGIN_ENABLED=false`
- `NEXT_PUBLIC_DEV_LOGIN_ENABLED=false`
- `ALLOW_INSECURE_DEV_WEBHOOKS=false`

Add these too if the related features are meant to be available on day one:

- `PLAID_CLIENT_ID`
- `PLAID_CLIENT_SECRET`
- `PLAID_ENV`
- `OPENAI_API_KEY`
- `GOOGLE_PLACES_API_KEY`
- `SUPER_ADMIN_EMAIL`