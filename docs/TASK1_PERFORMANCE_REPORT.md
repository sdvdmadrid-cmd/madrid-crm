# Task 1 — Application Performance (Complete)

Date: 2026-06-04

## Root causes

| Issue | Impact |
| --- | --- |
| `AuthShell` called `/api/auth/me` on **every route change** (`pathname` in effect deps) | Extra network + re-renders; felt like lag between pages |
| `useCurrentUserAccess` fetched `/api/auth/me` again on **every page** that used it | Duplicate session work (jobs, invoices, clients, bill-payments, etc.) |
| Dashboard fetched `/api/auth/me` a **third time** on load | Redundant with shell session |
| `website-builder/publish-status` re-fetched on every navigation | Unnecessary API noise |
| Invoice list refetched on **every tab focus** (`visibilitychange`) | Freezes when switching browser tabs |
| Calendar `DayCell` filtered all appointments **per cell** (42× per render) | CPU spikes on month view |
| Weather API requested for **gray (adjacent month) cells** | ~12 extra `/api/weather` calls per month |
| Heavy routes loaded in main bundle | Slower first paint for calendar |

## Fixes applied

1. **`AuthSessionContext`** — single session source from `AuthShell`; `useCurrentUserAccess` reads context (no duplicate fetch).
2. **Auth bootstrap once** — session loads on mount only, not on each `pathname` change.
3. **Dashboard** — removed redundant `/api/auth/me`; uses shared session for name/role.
4. **Invoices** — tab-focus refresh throttled to **60s** minimum.
5. **Calendar** — `appointmentsByDateKey` index; `memo(DayCell)`; weather only for **current-month** cells; lazy-loaded calendar route chunk.
6. **Bill-payments** (prior session) — Stripe wallet deferred via `dynamic()`; dead Stripe code removed from main chunk.

## Files changed

- `src/context/AuthSessionContext.jsx` (new)
- `src/lib/current-user-client.js`
- `src/components/AuthShell.js`
- `src/app/dashboard/page.js`
- `src/app/invoices/page.js`
- `src/app/calendar/page.js`
- `src/components/calendar/Calendar.jsx`
- `src/components/calendar/DayCell.jsx`
- `src/hooks/useWeather.js`

## Verification

- `npm run build` — pass
- `npm run test:unit` — 212/212 pass
- Playwright: calendar, dashboard, invoices, contractor-workflows audit specs — run after deploy (see CI/local log)

## Not in scope (follow-up)

- Virtualized invoice/client tables for 1000+ rows
- Batched weather API endpoint (single request for month)
- Remove unused `AddressAutocomplete.jsx` (Google Maps SDK)

---

**Task 1 complete.** Proceed to Task 2 (Calendar address autocomplete) only after user confirmation or explicit continue.
