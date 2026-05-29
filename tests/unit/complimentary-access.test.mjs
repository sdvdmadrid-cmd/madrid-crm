import assert from "node:assert/strict";
import test from "node:test";
import {
  applyComplimentarySessionFields,
  getComplimentaryTenantIds,
  isComplimentaryTenant,
} from "../../src/lib/complimentary-access.js";

const MADRID_TENANT = "d38fec7b-adac-4b7f-a46d-2ccadab6e452";

test("Madrid tenant is built-in complimentary", () => {
  assert.equal(isComplimentaryTenant(MADRID_TENANT), true);
  assert.equal(isComplimentaryTenant("other-tenant"), false);
  assert.ok(getComplimentaryTenantIds().has(MADRID_TENANT));
});

test("applyComplimentarySessionFields upgrades subscription flags", () => {
  const out = applyComplimentarySessionFields({
    tenantDbId: MADRID_TENANT,
    isSubscribed: false,
    trialEndDate: "2026-06-01T00:00:00.000Z",
  });
  assert.equal(out.isSubscribed, true);
  assert.equal(out.complimentaryAccess, true);
  assert.equal(out.trialEndDate, null);
});

test("non-complimentary tenants are unchanged", () => {
  const out = applyComplimentarySessionFields({
    tenantDbId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    isSubscribed: false,
    trialEndDate: "2026-06-01T00:00:00.000Z",
  });
  assert.equal(out.isSubscribed, false);
  assert.equal(out.complimentaryAccess, undefined);
});
