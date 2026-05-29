# Jobber CRM — QA status

**Last updated:** 2026-05-28  
**Schema:** `npm run validate:jobber-schema` — **PASSED** (remote)  
**Deploy:** **BLOCKED** — live Jobber OAuth + full sync + manual QA not completed

## Done (code + database)

| Area | Status |
|------|--------|
| `estimate_builder.quote_number` removed; use `estimate_number` + `quote_id` | Applied on remote |
| Jobber CRM migration (`jobber_id`, child tables, `integrations.metadata`) | Applied on remote |
| OAuth routes + GraphQL sync service | Implemented |
| CSV import: Jobber aliases, non-destructive updates | Implemented |
| Client details panel + Jobber integration UI | Implemented |
| CLI ops: `npm run jobber:*` | See [JOBBER_DEPLOY_RUNBOOK.md](./JOBBER_DEPLOY_RUNBOOK.md) |
| Sync links existing CSV clients by email/phone/name when `jobber_id` empty | Implemented |

## Data reality (production Supabase)

| Metric | Value |
|--------|-------|
| Clients | 82 |
| Jobber integration rows | **0** |
| Clients with `jobber_id` | **0** |
| Many CSV clients missing phone/email | Yes — backfill or API sync required |

Primary tenant (most clients): `d38fec7b-adac-4b7f-a46d-2ccadab6e452`

## Blockers (must complete before deploy)

1. **Jobber credentials** — `JOBBER_CLIENT_ID` / `JOBBER_CLIENT_SECRET` not in `.env.local`
2. **OAuth connect** — UI or `jobber:store-tokens` after authorize
3. **Full sync** — `npm run jobber:sync` or **Sync now**
4. **CSV update** — re-import with “Update existing” or `jobber:csv-update`
5. **Manual QA** — 3+ real clients, all user actions, clean console/network
6. **Owner sign-off** — screenshots + sync summary

## Commands

```bash
npm run jobber:check-config
npm run jobber:oauth-url
npm run jobber:store-tokens      # after tokens available
npm run jobber:refresh-test
npm run jobber:probe
npm run jobber:sync
npm run jobber:csv-update -- export.csv
npm run jobber:qa-report

npm run validate:jobber-schema
npm run audit:jobber-crm
npm run test:unit
npm run build
```

## Deploy gate checklist

- [ ] Jobber connected (integration row + valid refresh token)
- [ ] Full sync completed (`lastSyncAt` set, `jobber:qa-report` exits 0)
- [ ] ≥3 clients with phone + email + linked jobs/quotes/invoices in UI
- [ ] Estimate promote / invoice flows — no `quote_number` errors
- [ ] Zero console GraphQL failures on clients + estimate-builder
- [ ] User approval to deploy
