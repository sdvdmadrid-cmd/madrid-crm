# Module audit: Calendar

**Status:** Complete — **signed off** ([CALENDAR_MODULE_SIGN_OFF.md](./CALENDAR_MODULE_SIGN_OFF.md))  
**Last updated:** 2026-05-28

---

## Workflows tested

| Workflow | Result |
|----------|--------|
| Page load + month grid | ✅ E2E |
| Today's schedule strip | ✅ UX shipped |
| Add appointment (modal) | ✅ E2E |
| 15-day weather forecast | ✅ Visible (`calendar-forecast-strip`) |
| AI scheduling assistant | Partial | Requires AI API — manual |
| Appointments API | ✅ E2E |

---

## Findings

### Fix now (shipped)

| Issue | Fix |
|-------|-----|
| No at-a-glance view of today's jobs | **Today's schedule** strip with quick open + add |
| E2E / automation gaps | `data-testid`: `calendar-shell`, `calendar-today-strip` |
| Day cells untested | Reuse `calendar-day-{YYYY-MM-DD}`; padding days use `data-is-current-month="false"` |

### Fix before production-ready

| Issue | Ledger | Notes |
|-------|--------|-------|
| ~~Padding-month days not clickable~~ | — | **Fixed 2026-06-12** — all grid days open scheduler |
| ~~Narrow ±1 month fetch window~~ | — | **Fixed 2026-06-12** — ±3 months + refetch after save |
| Weather panel dominates mobile viewport | — | Collapse weather by default on small screens |
| AI scheduling errors unclear when feature off | B-006 | Platform feature flag |
| Job ↔ appointment sync | — | Separate jobs calendar integration |

### Future enhancement

| Issue | Justification |
|-------|---------------|
| Week/agenda view | Power users; month grid sufficient v1 |
| Crew color-coding | Multi-crew ops phase |
| iCal export | Integration phase |

---

## E2E

`tests/e2e/audit/calendar-module.spec.js`
