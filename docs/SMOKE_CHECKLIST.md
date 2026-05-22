# Smoke checklist (pre-release)

Run with `npm run dev` (or staging URL) after Phase 0/1+ changes.

## Auth

- [ ] Login with tenant user → lands on `/dashboard`
- [ ] Login with `super_admin` → lands on `/owner/overview`
- [ ] `GET /api/auth/me` returns `tenantDbId` and role
- [ ] Logout clears session

## CRM core

- [ ] `/clients` — list loads; create one client
- [ ] `/jobs` — list loads; create one job linked to client
- [ ] `/invoices` — list loads
- [ ] `/lead-inbox` — loads (if enabled for tenant)

## API health

- [ ] `GET /api/health` → 200
- [ ] Tenant user cannot read another tenant's client by ID (403/404)

## Bill payments (if enabled)

- [ ] `/bill-payments` loads
- [ ] `npm run bill:autopay` dry-run with cron secret (staging)

## Production boot

- [ ] Deploy preview: server logs `[startup] Production configuration validated.`
- [ ] Missing `SESSION_SECRET` fails startup in production

## Production smoke (fieldbaseapp.net) — 2026-05-22

Automated checks:

- [x] `GET /api/health` → 200, `success: true`
- [x] `GET /login` → 200
- [x] `GET /robots.txt` → reachable
- [x] Supabase migration `20260523100000_payments_hardening_connect_prep.sql` applied (manual SQL Editor)
- [x] `STRIPE_CONNECT_ENABLED=false` on Vercel Production

Manual (your account):

- [ ] Login contractor → `/dashboard` (premium UI)
- [ ] Create client → job → invoice → Stripe checkout link
- [ ] Login owner (`SUPER_ADMIN_EMAIL`) → `/owner/overview` (not contractor CRM)
- [ ] `POST /api/payments/connect/onboard` → 503 `connect_not_enabled` (expected until Connect live)
