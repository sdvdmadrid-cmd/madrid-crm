# Jobber final validation phase — report

**Generated:** 2026-05-28  
**Command:** `npm run jobber:validate-phase`  
**Deployment approval:** **DENIED** (operational blockers remain)

## Phase summary

| Phase | Goal | Status | Evidence |
|-------|------|--------|----------|
| **0** | Routes deployed on host | **FAIL** | All `/api/integrations/jobber/*` → **404** on `fieldbaseapp.net` |
| **1** | Live OAuth + tokens | **BLOCKED** | No `JOBBER_CLIENT_ID` / `JOBBER_CLIENT_SECRET` in `.env.local`; **0** `integrations` rows |
| **2** | probe / refresh / sync / qa-report | **NOT RUN** | Requires Phase 1 tokens |
| **3** | CSV backfill + dedupe | **NOT RUN** | No Jobber CSV in repo; use UI or `jobber:csv-update` after export |
| **4** | Manual production QA | **NOT RUN** | Requires login + deployed or local app |
| **5** | Deployment gate | **FAIL** | Schema/tests pass; operational gates fail |

## Passed (backend / code gates)

- `npm run validate:jobber-schema` — **PASSED** (production Supabase)
- `npm run audit:jobber-crm` — ran (69 clients, 0 Jobber-linked)
- `npm run test:unit` — **147/147 passed**
- `npm run build` — passes (from prior session)

## Critical finding: app not deployed

Production does **not** include Jobber integration routes yet. OAuth on `https://fieldbaseapp.net` cannot work until app code is deployed **or** you validate on **localhost** against the same production database.

## Staging path (recommended before production deploy)

1. Add to `.env.local` (same Supabase as production):

   ```env
   JOBBER_CLIENT_ID=...
   JOBBER_CLIENT_SECRET=...
   JOBBER_REDIRECT_URI=http://localhost:3000/api/integrations/jobber/callback
   ```

2. Register **localhost** callback in Jobber Developer Center.

3. `npm run dev` → sign in → Clients → **Connect Jobber** (or `npm run jobber:oauth-url`).

4. `npm run jobber:validate-phase` (runs probe, refresh-test, sync, qa-report when connected).

5. Re-import CSV with **Update existing clients** or `npm run jobber:csv-update -- export.csv`.

6. Manual QA on 3+ synced clients (detail panel + all actions).

7. Deploy app + set Vercel env (`JOBBER_*`, production redirect URI).

8. Re-run OAuth on production URL + `jobber:validate-phase` + manual QA.

9. Owner sign-off → production approval.

## Phase 4 manual checklist (your browser)

- [ ] Client detail: full load, no red errors, linked jobs/quotes/invoices/estimates
- [ ] New Estimate → builder opens with `clientId`
- [ ] Promote estimate (no `quote_number` error)
- [ ] Create invoice from client
- [ ] Edit client / delete test client
- [ ] Refresh + logout/login persistence
- [ ] Network: zero failed API / GraphQL / hydration errors

## Unblock the agent

Add Jobber credentials to `.env.local` (do not paste secrets in chat). Then ask to re-run:

```bash
npm run jobber:validate-phase
```
