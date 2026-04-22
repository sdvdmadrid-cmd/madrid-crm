# ContractorFlow Security Hardening Roadmap

This plan is prioritized for payment flows and accounting-grade data integrity.

## Phase 0 - Immediate Lockdown (Today)

1. Rotate exposed secrets immediately:
	- STRIPE_SECRET_KEY
	- RESEND_API_KEY
	- OPENAI_API_KEY
	- Any leaked DB credentials
2. Set and keep a strong SESSION_SECRET (minimum 32 random bytes).
3. Ensure SUPABASE_SERVICE_ROLE_KEY is only used server-side.
4. Keep .env.local out of source control (already covered by .gitignore).

## Phase 1 - Identity and Session Hardening (24-48h)

1. Choose one auth source of truth:
	- Option A: Supabase Auth (recommended)
	- Option B: Existing JWT auth only
2. If choosing Supabase Auth:
	- Migrate login/logout to Supabase SSR session cookies.
	- Validate auth token on every protected API route.
3. Enforce session controls:
	- Absolute expiration
	- Inactivity timeout
	- Device/session revoke endpoint
4. Add brute-force protection:
	- Rate limits on login and password reset
	- Optional account lockout threshold

## Phase 2 - Data Isolation and RLS Enforcement (48-72h)

1. Apply and verify RLS migration in Supabase:
	- clients, estimates, jobs, payments
	- select/insert/update/delete policies bound to auth.uid() = user_id
2. Add schema guarantees:
	- user_id not null
	- user_id uuid
	- foreign key to auth.users(id)
3. Add indexes for policy performance:
	- index on user_id for each protected table
4. Run access tests:
	- user A cannot read/write user B rows
	- anonymous cannot access protected rows

## Phase 3 - Payments Security (Stripe) (3-5 days)

1. Webhook hardening:
	- Verify Stripe signature
	- Idempotency key and replay protection
2. Payment state integrity:
	- Single authoritative payment ledger table
	- Immutable event history (append-only)
3. Money correctness:
	- Store amounts as integers in minor units (cents)
	- Consistent currency handling
4. API controls:
	- Strict validation for payment endpoints
	- Rate limits on checkout/session creation

## Phase 4 - Accounting Integrity and Auditability (1-2 weeks)

1. Immutable audit log for critical actions:
	- Invoice updates
	- Payment reconciliation
	- Client/job ownership changes
2. Double-entry style accounting model (if replacing QuickBooks):
	- Journal entries
	- Accounts chart
	- Reconciliation workflow
3. Deterministic exports:
	- Signed export jobs
	- Snapshot timestamps
4. Backups and recovery:
	- Automated backups
	- Restore drill

## Phase 5 - Operational Security Baseline (ongoing)

1. Add SIEM-style logs for auth and payment anomalies.
2. Add alerting for:
	- Spike in failed logins
	- Repeated webhook signature failures
	- Unusual payment attempts
3. Security testing cadence:
	- Dependency scanning
	- SAST/secret scanning in CI
	- Quarterly pentest

## Non-Negotiables for Production

1. Never use service role key in browser code.
2. Never trust client-provided ownership fields without server validation.
3. Never process payment state transitions without idempotency and audit logging.
4. Never deploy with default/fallback secrets.

## Operational Companion

Use [SECURITY_KEY_ROTATION_RUNBOOK.md](SECURITY_KEY_ROTATION_RUNBOOK.md) for live secret rotation and post-rotation validation.

