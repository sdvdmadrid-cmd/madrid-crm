# Module audit: Service Catalog

**Status:** Complete — **signed off** ([SERVICE_CATALOG_MODULE_SIGN_OFF.md](./SERVICE_CATALOG_MODULE_SIGN_OFF.md))  
**Last updated:** 2026-05-28

---

## Workflows tested

| Workflow | Result |
|----------|--------|
| List + CRUD form | ✅ Manual + API |
| Search filter | ✅ UX + E2E |
| Link to website builder | ✅ UX |
| DELETE confirm | ✅ Existing (`confirm`) |
| GET/POST/PATCH API | ✅ E2E |

---

## Findings

### Fix now (shipped)

| Issue | Fix |
|-------|-----|
| No search on growing catalogs | **Search services** input |
| Disconnected from website/estimates context | Header **Website builder** link |
| E2E gaps | `services-catalog-*` test ids |

### Fix before production-ready

| Issue | Ledger | Notes |
|-------|--------|-------|
| Hardcoded English strings | B-005 | Move to `en.json` |
| Delete uses `window.confirm` | — | Replace with accessible modal |
| Pick catalog item into estimate editor | E-005 area | Consistency |

### Future enhancement

| Issue | Justification |
|-------|---------------|
| CSV import | Onboarding bulk |
| Service images | Website gallery tie-in |

---

## E2E

`tests/e2e/audit/services-catalog-module.spec.js`
