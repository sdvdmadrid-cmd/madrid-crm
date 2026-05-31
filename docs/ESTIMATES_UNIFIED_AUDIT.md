# Estimates — unified workflow audit (May 2026)

## Canonical system (single source of truth)

| Layer | Path / table |
|--------|----------------|
| **UI — list** | `/estimates` (kanban) |
| **UI — create/edit** | `/estimates/new` (`?edit=`, `?clientId=`) |
| **API** | `/api/estimates`, `/api/estimates/[id]`, respond/revisions/PDF |
| **Database** | `public.estimates` |

## Retired (removed from app)

| Layer | Was | Now |
|--------|-----|-----|
| Page | `/estimate-builder` | **308 → `/estimates/new`** (middleware) |
| API | `/api/estimate-builder/*` | **410 Gone** (middleware) |
| Component | `NewEstimateForm.js` (STEP 1/2/3 UI) | **Deleted** |
| Records helper | `estimate-builder-records.js` | **Deleted** |

## Legacy data migration

- Column `estimates.legacy_builder_id` links rows migrated from `estimate_builder`.
- Run once (after `npm run db:migrate`):
  - `npm run estimates:migrate-legacy` — dry-run counts
  - `npm run estimates:migrate-legacy:apply` — writes to `estimates`
- Kanban (`/estimates`) and client details read **only** `estimates` after migration.
- Client details panel does **not** show legacy Jobber `quotes`; active work is under Estimates only. The `quotes` table remains for import/history and invoice FKs only.
- Migrated rows store `clientUuid` in `estimates.notes` when production `client_id` is bigint (legacy builder used uuid text).

## Preserved for data safety (read-only / integrations)

| Asset | Why kept |
|--------|----------|
| Table `estimate_builder` | Historical rows, Jobber sync, invoice FK (`invoices.estimate_id`) |
| `estimate-invoice-linking.js` | Invoice number lookup: `estimates` table only (archived builder rows not used in live UI) |
| Client details | Merges pipeline `estimates` + archived legacy rows (`isLegacy: true`) |

## Redirects & guards

- `middleware.js`: `/estimate-builder` → `/estimates/new`; `/api/estimate-builder` → 410
- `npm run verify:estimates-unified`: fails if legacy UI paths/components reappear under `src/`

## Create Estimate entry points

All route to `/estimates/new`: Estimates kanban, Dashboard, Clients list, Client details, AI bubble, `/smart-estimator` → `/estimates`.
