import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const root = process.cwd();

test("PlacesAutocomplete uses server proxy routes", () => {
  const src = readFileSync(
    path.join(root, "src/components/PlacesAutocomplete.js"),
    "utf8",
  );
  assert.match(src, /\/api\/places\/autocomplete/);
  assert.match(src, /\/api\/places\/details/);
  assert.doesNotMatch(src, /NEXT_PUBLIC_GOOGLE_PLACES/);
});

test("active address forms import PlacesAutocomplete", () => {
  for (const file of [
    "src/components/clients/ClientForm.js",
    "src/app/estimates/new/page.js",
    "src/components/calendar/AppointmentModal.jsx",
    "src/app/jobs/page.js",
  ]) {
    const src = readFileSync(path.join(root, file), "utf8");
    assert.match(src, /PlacesAutocomplete/);
  }
});

test("payroll employees use AddressFieldsGroup with Places", () => {
  const src = readFileSync(
    path.join(root, "src/components/payroll/PayrollEmployeeForm.jsx"),
    "utf8",
  );
  assert.match(src, /AddressFieldsGroup/);
});

test("legacy AddressAutocomplete client-side maps component was removed", () => {
  assert.equal(
    existsSync(path.join(root, "src/components/AddressAutocomplete.jsx")),
    false,
  );
  const clientForm = readFileSync(
    path.join(root, "src/components/clients/ClientForm.js"),
    "utf8",
  );
  assert.doesNotMatch(clientForm, /AddressAutocomplete/);
});

test("API routes read GOOGLE_PLACES_API_KEY", () => {
  for (const file of [
    "src/app/api/places/autocomplete/route.js",
    "src/app/api/places/details/route.js",
  ]) {
    const src = readFileSync(path.join(root, file), "utf8");
    assert.match(src, /GOOGLE_PLACES_API_KEY/);
    assert.match(src, /getAuthenticatedTenantContext/);
  }
});

test("verify:places script exists", () => {
  assert.ok(existsSync(path.join(root, "scripts/verify-places-autocomplete.mjs")));
  const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
  assert.ok(pkg.scripts["verify:places"]);
});
