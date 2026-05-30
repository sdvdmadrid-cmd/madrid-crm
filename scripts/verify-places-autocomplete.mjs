#!/usr/bin/env node
/**
 * End-to-end check for Google Places address autocomplete (server proxy).
 * Usage: node scripts/verify-places-autocomplete.mjs
 */
import { loadEnvLocal } from "./load-env-local.mjs";

loadEnvLocal(process.cwd());

const key = process.env.GOOGLE_PLACES_API_KEY;
const base = process.env.APP_BASE_URL || "http://localhost:3000";

let failed = 0;

function fail(msg) {
  console.error(`[FAIL] ${msg}`);
  failed += 1;
}

function ok(msg) {
  console.log(`[OK] ${msg}`);
}

if (!key || key.length < 20) {
  fail("GOOGLE_PLACES_API_KEY missing or too short in .env.local");
  console.log("\nAdd to .env.local:");
  console.log("  GOOGLE_PLACES_API_KEY=<your Maps Platform API key>");
  process.exit(1);
}

ok(`GOOGLE_PLACES_API_KEY present (${key.length} chars)`);

const testInput = "1600 Amphitheatre Parkway";
const acParams = new URLSearchParams({
  input: testInput,
  types: "address",
  language: "en",
  components: "country:us",
  key,
});

const acRes = await fetch(
  `https://maps.googleapis.com/maps/api/place/autocomplete/json?${acParams}`,
  { signal: AbortSignal.timeout(8000) },
);
const acData = await acRes.json();

if (acData.status === "REQUEST_DENIED") {
  fail(`Autocomplete: ${acData.error_message || acData.status}`);
  console.log("  → Enable Places API on the same GCP project as this key.");
  console.log("  → Check API key restrictions (HTTP referrers vs IP vs none).");
} else if (acData.status !== "OK" || !acData.predictions?.length) {
  fail(`Autocomplete: status=${acData.status} predictions=${acData.predictions?.length ?? 0}`);
} else {
  ok(`Autocomplete API: ${acData.predictions.length} prediction(s) for test query`);
  const placeId = acData.predictions[0].place_id;
  const detParams = new URLSearchParams({
    place_id: placeId,
    fields: "formatted_address,address_components,geometry",
    key,
  });
  const detRes = await fetch(
    `https://maps.googleapis.com/maps/api/place/details/json?${detParams}`,
    { signal: AbortSignal.timeout(8000) },
  );
  const detData = await detRes.json();
  if (detData.status !== "OK") {
    fail(`Place Details: ${detData.status} ${detData.error_message || ""}`);
  } else {
    const r = detData.result || {};
    ok(
      `Place Details: ${r.formatted_address || "address"} (components=${(r.address_components || []).length})`,
    );
  }
}

// Optional: hit local Next routes (requires dev server + session cookie — skipped by default)
if (process.argv.includes("--local-app")) {
  console.log("\n[info] Local app check requires logged-in session on", base);
  console.log("  1. npm run dev");
  console.log("  2. Log in → Clients → New client → type address (3+ chars)");
  console.log("  3. Pick suggestion → city/state/zip should fill");
}

console.log("\n--- GCP APIs to enable (Google Cloud Console → APIs & Services → Library) ---");
for (const api of [
  "Places API",
  "Places API (New)",
  "Geocoding API",
  "Maps JavaScript API",
]) {
  console.log(`  • ${api}`);
}

console.log("\n--- Where to paste the key in FieldBase (this repo) ---");
console.log("  Local:     .env.local → GOOGLE_PLACES_API_KEY=<Maps Platform API key>");
console.log("  Vercel:    Project → Settings → Environment Variables → GOOGLE_PLACES_API_KEY (Production + Preview)");
console.log("  Optional:  NEXT_PUBLIC_GOOGLE_MAPS_API_KEY (only if using AddressAutocomplete.jsx in browser)");

console.log("\n--- UI surfaces using autocomplete (server proxy) ---");
console.log("  • Clients → add/edit client (Address line 1)");
console.log("  • Estimates → new estimate (job/site address)");

process.exit(failed ? 1 : 0);
