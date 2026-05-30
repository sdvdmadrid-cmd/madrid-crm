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

## Preserved for data safety (read-only / integrations)

| Asset | Why kept |
|--------|----------|
| Table `estimate_builder` | Historical rows, Jobber sync, invoice FK (`invoices.estimate_id`) |
| `estimate-builder-linking.js` | Invoice number lookup: `estimates` first, legacy table fallback |
| Client details | Merges pipeline `estimates` + archived legacy rows (`isLegacy: true`) |

## Redirects & guards

- `middleware.js`: `/estimate-builder` → `/estimates/new`; `/api/estimate-builder` → 410
- `npm run verify:estimates-unified`: fails if legacy UI paths/components reappear under `src/`

## Create Estimate entry points

All route to `/estimates/new`: Estimates kanban, Dashboard, Clients list, Client details, AI bubble, `/smart-estimator` → `/estimates`.
