import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeTenantAccountStatus,
  isPlatformTenantAccount,
  tenantDbIdFromUser,
} from "../../src/lib/platform-tenant-accounts.js";

describe("platform-tenant-accounts", () => {
  it("includes owner signups in platform tenant accounts", () => {
    const owner = {
      id: "uuid-owner",
      app_metadata: { role: "owner", tenant_db_id: "uuid-owner" },
      user_metadata: { trialEndDate: "2026-12-01T00:00:00.000Z" },
    };
    const superAdmin = { app_metadata: { role: "super_admin" } };

    assert.equal(isPlatformTenantAccount(owner), true);
    assert.equal(isPlatformTenantAccount(superAdmin), false);
    assert.equal(tenantDbIdFromUser(owner), "uuid-owner");
    assert.equal(computeTenantAccountStatus(owner), "trial");
  });

  it("treats complimentary and subscribed users as active", () => {
    assert.equal(
      computeTenantAccountStatus({
        user_metadata: { complimentaryAccess: true },
      }),
      "active",
    );
    assert.equal(
      computeTenantAccountStatus({
        user_metadata: { isSubscribed: true },
      }),
      "active",
    );
  });
});
