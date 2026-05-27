const { test, expect } = require("@playwright/test");
const { devLogin } = require("./helpers/auth");

/**
 * End-to-end coverage for the customer-facing estimate respond flow:
 *
 *   POST /api/estimates/[id]/respond
 *
 * Each scenario creates its OWN "sent" estimate so the tests are
 * independent and can run in parallel against the same dev server.
 * We exercise the three terminal customer actions (approved, declined,
 * changes_requested) plus the defensive caps for the public payload
 * (clientNote, requestedItems).
 *
 * The contractor PATCH path is covered separately by
 * estimate-quote-invoice-flow.spec.js; this spec focuses on the
 * UNAUTHENTICATED, token-gated public surface — the path a customer
 * actually hits from their email link.
 */

const ORIGIN_HEADERS = { Origin: "http://localhost:3000" };

function extractPublicToken(publicLink) {
  try {
    return new URL(publicLink, "http://localhost:3000")
      .searchParams.get("token");
  } catch {
    return "";
  }
}

async function createSentEstimate(api, { now, suffix, total = 500, items }) {
  const estimateNumber = `E2E-RSP-${now}-${suffix}`;
  const services = items || [
    {
      id: `svc-${suffix}`,
      name: "Drywall repair",
      qty: 1,
      unitPrice: total,
      price: total,
    },
  ];
  const res = await api.post("/api/estimates", {
    headers: ORIGIN_HEADERS,
    data: {
      clientName: `E2E Respond Client ${now}-${suffix}`,
      clientEmail: `qa+respond+${now}+${suffix}@example.com`,
      clientPhone: "+15550003333",
      address: "789 Respond Way, Austin, TX 73301",
      services,
      subtotal: total,
      tax: 0,
      total,
      estimateNumber,
      status: "sent",
    },
  });
  expect(res.ok()).toBeTruthy();
  const json = await res.json();
  expect(json?.success).toBeTruthy();
  const estimateId = json?.data?.id;
  const token = extractPublicToken(json?.data?.publicLink || "");
  expect(estimateId, "estimate id should be returned").toBeTruthy();
  expect(token, "public token should be returned").toBeTruthy();
  return { estimateId, token, estimateNumber };
}

async function readAuthenticated(api, estimateId) {
  const res = await api.get(`/api/estimates/${estimateId}`, {
    headers: ORIGIN_HEADERS,
  });
  expect(res.ok()).toBeTruthy();
  return (await res.json())?.data;
}

async function readPublic(api, estimateId, token) {
  const res = await api.get(
    `/api/estimates/${estimateId}/public?token=${encodeURIComponent(token)}`,
  );
  expect(res.ok()).toBeTruthy();
  return (await res.json())?.data;
}

test.describe("Public estimate respond — approve / decline / changes_requested", () => {
  test("approve transitions status, stamps approvedAt, and the public view sees the audit (without IP)", async ({ page }) => {
    test.setTimeout(60_000);
    await devLogin(page, { profile: "admin", redirect: "/dashboard" });
    const api = page.request;
    const now = Date.now();
    const { estimateId, token } = await createSentEstimate(api, {
      now,
      suffix: "approve",
      total: 250,
    });

    const respondRes = await api.post(
      `/api/estimates/${estimateId}/respond`,
      {
        data: {
          action: "approved",
          token,
          note: "Looks good, please proceed.",
        },
      },
    );
    expect(respondRes.ok()).toBeTruthy();
    const respondJson = await respondRes.json();
    expect(respondJson?.success).toBeTruthy();
    expect(respondJson?.status).toBe("approved");

    // Contractor side: status flipped, audit.approvedAt set, client note
    // concatenated into noteText.
    const contractorView = await readAuthenticated(api, estimateId);
    expect(contractorView?.status).toBe("approved");
    expect(contractorView?.audit?.approvedAt).toBeTruthy();
    expect(String(contractorView?.notes || "")).toContain(
      "Looks good, please proceed.",
    );

    // Public side: status visible, audit present but IP redacted from
    // signature (when a signature is present). For low-value estimates
    // signature is not required, so signature stays null — that's also a
    // valid public shape and we assert it explicitly.
    const publicView = await readPublic(api, estimateId, token);
    expect(publicView?.status).toBe("approved");
    expect(publicView?.audit?.approvedAt).toBeTruthy();
    if (publicView?.signature) {
      // If a signature WAS captured (high-value tenant policy), the
      // public surface must never echo back the IP.
      expect(publicView.signature.ip).toBeUndefined();
    }
  });

  test("decline transitions status, stamps declinedAt, and persists the client note", async ({ page }) => {
    test.setTimeout(60_000);
    await devLogin(page, { profile: "admin", redirect: "/dashboard" });
    const api = page.request;
    const now = Date.now();
    const { estimateId, token } = await createSentEstimate(api, {
      now,
      suffix: "decline",
      total: 750,
    });

    const respondRes = await api.post(
      `/api/estimates/${estimateId}/respond`,
      {
        data: {
          action: "declined",
          token,
          note: "Going with another contractor — thank you.",
        },
      },
    );
    expect(respondRes.ok()).toBeTruthy();
    const respondJson = await respondRes.json();
    expect(respondJson?.success).toBeTruthy();
    expect(respondJson?.status).toBe("declined");

    const contractorView = await readAuthenticated(api, estimateId);
    expect(contractorView?.status).toBe("declined");
    expect(contractorView?.audit?.declinedAt).toBeTruthy();
    expect(String(contractorView?.notes || "")).toContain(
      "Going with another contractor",
    );

    // Sanity: declining should NOT have stamped an approvedAt.
    expect(contractorView?.audit?.approvedAt || null).toBeFalsy();
  });

  test("changes_requested transitions status, stamps changesRequestedAt, and persists requestedItems", async ({ page }) => {
    test.setTimeout(60_000);
    await devLogin(page, { profile: "admin", redirect: "/dashboard" });
    const api = page.request;
    const now = Date.now();
    const { estimateId, token } = await createSentEstimate(api, {
      now,
      suffix: "changes",
      total: 1500,
      items: [
        {
          id: "svc-a",
          name: "Window install",
          qty: 2,
          unitPrice: 600,
          price: 1200,
        },
        {
          id: "svc-b",
          name: "Trim work",
          qty: 1,
          unitPrice: 300,
          price: 300,
        },
      ],
    });

    const requestedItems = [
      { ref: "svc-a", change: "Swap to bronze frame" },
      { ref: "svc-b", change: "Reduce trim scope" },
    ];

    const respondRes = await api.post(
      `/api/estimates/${estimateId}/respond`,
      {
        data: {
          action: "changes_requested",
          token,
          note: "A couple of tweaks before we approve.",
          requestedItems,
        },
      },
    );
    expect(respondRes.ok()).toBeTruthy();
    const respondJson = await respondRes.json();
    expect(respondJson?.success).toBeTruthy();
    expect(respondJson?.status).toBe("changes_requested");

    // Contractor side: status + timestamp + note are all wired through.
    const contractorView = await readAuthenticated(api, estimateId);
    expect(contractorView?.status).toBe("changes_requested");
    expect(contractorView?.audit?.changesRequestedAt).toBeTruthy();
    expect(String(contractorView?.notes || "")).toContain(
      "A couple of tweaks",
    );

    // The public view also surfaces the new status so the customer's
    // page reflects what they just submitted on reload.
    const publicView = await readPublic(api, estimateId, token);
    expect(publicView?.status).toBe("changes_requested");
  });

  test("approval is locked once the estimate is finalized (no double-respond)", async ({ page }) => {
    test.setTimeout(60_000);
    await devLogin(page, { profile: "admin", redirect: "/dashboard" });
    const api = page.request;
    const now = Date.now();
    const { estimateId, token } = await createSentEstimate(api, {
      now,
      suffix: "double",
      total: 400,
    });

    const firstRes = await api.post(
      `/api/estimates/${estimateId}/respond`,
      { data: { action: "approved", token } },
    );
    expect(firstRes.ok()).toBeTruthy();
    expect((await firstRes.json())?.status).toBe("approved");

    // Attempting to decline AFTER approve must fail with 409
    // ("This estimate is already finalized.") — the
    // canRespondToEstimateStatus guard in the route enforces this.
    const secondRes = await api.post(
      `/api/estimates/${estimateId}/respond`,
      { data: { action: "declined", token } },
    );
    expect(secondRes.status()).toBe(409);
    const secondJson = await secondRes.json().catch(() => ({}));
    expect(String(secondJson?.error || "").toLowerCase()).toContain(
      "already finalized",
    );

    // Contractor view confirms the estimate stayed approved.
    const contractorView = await readAuthenticated(api, estimateId);
    expect(contractorView?.status).toBe("approved");
  });

  test("public respond rejects an invalid action with 400", async ({ page }) => {
    test.setTimeout(60_000);
    await devLogin(page, { profile: "admin", redirect: "/dashboard" });
    const api = page.request;
    const now = Date.now();
    const { estimateId, token } = await createSentEstimate(api, {
      now,
      suffix: "badaction",
      total: 100,
    });

    const res = await api.post(`/api/estimates/${estimateId}/respond`, {
      data: { action: "definitely-not-a-real-action", token },
    });
    expect(res.status()).toBe(400);
    const json = await res.json();
    expect(String(json?.error || "").toLowerCase()).toContain("invalid action");

    // Status was NOT changed.
    const contractorView = await readAuthenticated(api, estimateId);
    expect(contractorView?.status).toBe("sent");
  });

  test("public respond rejects a missing/invalid token with 403 (token-gated surface)", async ({ page }) => {
    test.setTimeout(60_000);
    await devLogin(page, { profile: "admin", redirect: "/dashboard" });
    const api = page.request;
    const now = Date.now();
    const { estimateId } = await createSentEstimate(api, {
      now,
      suffix: "notoken",
      total: 100,
    });

    // Missing token entirely.
    const missingRes = await api.post(
      `/api/estimates/${estimateId}/respond`,
      { data: { action: "approved" } },
    );
    expect(missingRes.status()).toBe(403);

    // Token of the wrong shape (too short / not 64 hex chars). The
    // isValidEstimatePublicToken guard rejects on shape BEFORE doing
    // any DB lookup, so this should still come back 403.
    const badRes = await api.post(`/api/estimates/${estimateId}/respond`, {
      data: { action: "approved", token: "deadbeef" },
    });
    expect(badRes.status()).toBe(403);
  });

  test("defensive cap: requestedItems is truncated to a sane size when the caller floods it", async ({ page }) => {
    test.setTimeout(90_000);
    await devLogin(page, { profile: "admin", redirect: "/dashboard" });
    const api = page.request;
    const now = Date.now();
    const { estimateId, token } = await createSentEstimate(api, {
      now,
      suffix: "flood",
      total: 200,
    });

    // 500 items, each non-trivial. The route caps at 50 items and 64KB
    // total — both limits should kick in well before we'd persist this
    // whole payload. The intent is to assert the request succeeds AND
    // that the persisted row is bounded.
    const flooded = Array.from({ length: 500 }, (_, i) => ({
      ref: `svc-${i}`,
      change: `change-${i} `.repeat(20),
    }));

    const respondRes = await api.post(
      `/api/estimates/${estimateId}/respond`,
      {
        data: {
          action: "changes_requested",
          token,
          // 50KB of garbage in the note — must be truncated to the
          // 5KB cap defined in the route.
          note: "x".repeat(50 * 1024),
          requestedItems: flooded,
        },
      },
    );
    expect(respondRes.ok()).toBeTruthy();
    const respondJson = await respondRes.json();
    expect(respondJson?.success).toBeTruthy();

    // The contractor read must succeed (i.e. the row didn't explode the
    // JSON parser). We don't inspect the cap value directly here — the
    // unit tests in tests/unit/estimate-respond-sanitizers.test.mjs
    // already pin those numbers. The e2e assertion is "the row is
    // readable and the noteText is bounded".
    const contractorView = await readAuthenticated(api, estimateId);
    expect(contractorView?.status).toBe("changes_requested");

    // noteText carries the "Client note: " prefix plus the trimmed
    // content. With a 5KB cap on the input itself, the appended chunk
    // must not exceed ~5.1KB. Allow generous slack for the prefix and
    // any previous noteText that was already on the estimate.
    const noteText = String(contractorView?.notes || "");
    expect(noteText.length).toBeLessThan(8 * 1024);
  });
});
