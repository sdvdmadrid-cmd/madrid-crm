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
