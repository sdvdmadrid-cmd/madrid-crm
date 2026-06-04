import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { summarizeOwnerLoginActivity } from "../../src/lib/owner-login-activity.js";

const NOW = new Date("2026-06-04T22:00:00.000Z").getTime();

describe("owner-login-activity", () => {
  it("summarizes contractor logins and excludes probes", () => {
    const snapshot = summarizeOwnerLoginActivity(
      [
        {
          id: "admin-1",
          email: "owner@fieldbase.net",
          app_metadata: { role: "super_admin" },
          last_sign_in_at: "2026-06-04T20:00:00.000Z",
        },
        {
          id: "c1",
          email: "active@example.com",
          app_metadata: { role: "contractor" },
          user_metadata: { companyName: "Active Co", status: "trial" },
          created_at: "2026-05-01T00:00:00.000Z",
          last_sign_in_at: "2026-06-04T21:00:00.000Z",
        },
        {
          id: "c2",
          email: "weekly@example.com",
          app_metadata: { role: "contractor" },
          user_metadata: { companyName: "Weekly Co" },
          created_at: "2026-05-01T00:00:00.000Z",
          last_sign_in_at: "2026-06-02T12:00:00.000Z",
        },
        {
          id: "c3",
          email: "never@example.com",
          app_metadata: { role: "contractor" },
          user_metadata: { companyName: "Never Co" },
          created_at: "2026-05-20T00:00:00.000Z",
          last_sign_in_at: null,
        },
        {
          id: "probe-1",
          email: "probe-123@mailinator.com",
          app_metadata: { role: "contractor" },
          created_at: "2026-05-21T00:00:00.000Z",
          last_sign_in_at: null,
        },
      ],
      { now: NOW },
    );

    assert.equal(snapshot.summary.contractorAccounts, 3);
    assert.equal(snapshot.summary.probeAccounts, 1);
    assert.equal(snapshot.summary.loggedInLast24h, 1);
    assert.equal(snapshot.summary.loggedInLast7d, 2);
    assert.equal(snapshot.summary.neverLoggedIn, 1);
    assert.equal(snapshot.rows[0].email, "active@example.com");
    assert.equal(snapshot.rows[0].activityBucket, "today");
    assert.equal(snapshot.rows.find((r) => r.email === "never@example.com").activityLabel, "Never");
  });
});
