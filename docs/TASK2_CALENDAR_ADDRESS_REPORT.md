# Task 2 — Calendar Address Autocomplete (Complete)

Date: 2026-06-04

## Problem

Appointment location was free-text only (`location` string). Contractors could save junk like `asdfasdfasdf` or `123 Fake Fake Fake` with no geocoding, which broke weather/maps and allowed invalid job sites.

## Solution

1. **Places-backed street field** — `AppointmentModal` uses shared `PlacesAutocomplete` (server proxy `/api/places/autocomplete` + `/api/places/details`), same pattern as `ClientForm`.
2. **Structured address + geo** — `latitude`, `longitude`, `address_place_id` on `appointments` (migration applied).
3. **Validation** — `src/lib/appointment-address.js` rejects junk text and requires verified selection (place ID + coordinates + city) when any address field is filled.
4. **API enforcement** — `POST/PATCH /api/appointments` validate payload server-side; geo columns stripped if schema missing (legacy fallback).

## Files changed

- `supabase/migrations/20260604130000_appointments_address_geo.sql`
- `src/lib/appointment-address.js` (new)
- `src/components/calendar/AppointmentModal.jsx`
- `src/app/api/appointments/route.js`
- `src/app/api/appointments/[id]/route.js`
- `src/i18n/locales/en.json` (`calendar.address.*`, `calendar.errors.invalidAddress`, `calendar.errors.addressNotVerified`)
- `tests/unit/appointment-address.test.mjs` (new)
- `tests/e2e/audit/calendar-module.spec.js` (junk rejection + verified save with mocked Places)

## Verification

- `npm run db:migrate` — applied `20260604130000_appointments_address_geo.sql`
- `node --test tests/unit/appointment-address.test.mjs` — 4/4 pass
- `npx playwright test tests/e2e/audit/calendar-module.spec.js` — 5/5 pass

## E2E notes

- Street input uses autofill `readonly` until focus — tests click `#appointment-address-street` before `fill`.
- Places suggestions are scoped under the autocomplete container (`li` under street input parent), not global `getByText` (avoids calendar day location labels).

## Not in scope

- Migrating legacy appointments without geo (edit requires re-selecting address to save if address fields are present)
- Removing unused `AddressAutocomplete.jsx` (Google Maps SDK)

---

**Task 2 complete.** Next: Task 3 (invoice line items UI bug).
