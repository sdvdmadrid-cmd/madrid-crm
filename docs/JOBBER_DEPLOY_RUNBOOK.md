# Jobber CRM — deploy runbook (do not skip manual QA)

Deployment stays **blocked** until every step below passes on **real** Jobber-connected data.

## Important: production vs staging

`https://fieldbaseapp.net/api/integrations/jobber/*` returns **404** until the Jobber integration **app code is deployed**. Database migrations are already on production Supabase, but OAuth/sync UI routes are local-only today.

**Recommended order:**

1. **Local staging QA** — `npm run dev` + `.env.local` (prod Supabase + Jobber creds) + `localhost` OAuth callback  
2. **CLI sync** — `npm run jobber:sync` against production DB  
3. **Deploy app** — ship Jobber routes + env vars to Vercel  
4. **Production OAuth** — `fieldbaseapp.net` callback + manual QA  
5. **Sign-off** — then approve production traffic

Check route deployment:

```bash
npm run jobber:verify-routes
npm run jobber:validate-phase
```

## 1. Configure Jobber OAuth

In [Jobber Developer Center](https://developer.getjobber.com/), register redirect URIs:

| Environment | Redirect URI |
|-------------|----------------|
| Production | `https://fieldbaseapp.net/api/integrations/jobber/callback` |
| Local dev | `http://localhost:3000/api/integrations/jobber/callback` |

Add to `.env.local` (and production env):

```env
JOBBER_CLIENT_ID=...
JOBBER_CLIENT_SECRET=...
JOBBER_REDIRECT_URI=https://fieldbaseapp.net/api/integrations/jobber/callback
JOBBER_GRAPHQL_VERSION=2025-01-20
```

Verify:

```bash
npm run jobber:check-config
npm run jobber:oauth-url
```

## 2. Connect and verify tokens

**UI:** Clients → Jobber sync → **Connect** → approve → return to app.

**CLI (optional, after OAuth code exchange or token export):**

```bash
# .env.local: JOBBER_ACCESS_TOKEN, JOBBER_REFRESH_TOKEN, JOBBER_TENANT_ID, JOBBER_USER_ID
npm run jobber:store-tokens
npm run jobber:refresh-test
npm run jobber:probe
```

## 3. Full Jobber sync

```bash
npm run jobber:sync
# or UI: Sync now
npm run jobber:qa-report
npm run audit:jobber-crm
```

Expect non-zero: clients (with `jobber_id`), properties, jobs, quotes, invoices, visits, requests, notes.

## 4. CSV backfill (incomplete imports)

Export from Jobber → re-import in UI with **Update existing clients**, or:

```bash
npm run jobber:csv-update -- path/to/jobber-clients.csv [tenant_id]
```

## 5. Manual UI QA (required)

On production (or local against prod DB), verify **3+ real clients**:

- Phone, email, address populated
- Properties, jobs, quotes, invoices, estimates in detail panel
- No empty broken sections; no console GraphQL errors

**Actions:** New Estimate, Promote Estimate, Create Invoice, Edit Client, Delete Client (test account), Refresh, Logout/Login.

## 6. Automated gates

```bash
npm run validate:jobber-schema
npm run audit:jobber-crm
npm run test:unit
npm run build
npm run jobber:qa-report
```

All must pass; `jobber:qa-report` exits 0 only when integration + sync + linked clients look healthy.

## 7. Deliverables before deploy approval

- Sync summary (`integrations.metadata.lastSyncSummary` or CLI output)
- Screenshots of 3+ client detail panels
- Browser console/network: zero failed API calls on clients + estimate flows
- Edge cases list
- Explicit **deployment readiness** sign-off

**Do not push/deploy** until product owner approves after manual QA.
