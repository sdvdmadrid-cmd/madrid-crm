const { test, expect } = require("@playwright/test");
const { createClient } = require("@supabase/supabase-js");
const fs = require("node:fs");
const path = require("node:path");

function loadDotEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  const out = {};
  if (!fs.existsSync(envPath)) return out;
  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx <= 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function requireEnvValue(key, fallbackMap) {
  const value = process.env[key] || fallbackMap[key] || "";
  if (!value) throw new Error(`Missing env value: ${key}`);
  return value;
}

test.describe("Estimate -> Quote flow checks (1,2,3)", () => {
  test("approval auto-converts, base number preserved, signed quote lock works", async ({ page }) => {
    // Ensure authenticated session cookie via dev-login helper.
    await page.goto("/api/auth/dev-login?profile=admin&redirect=%2Fdashboard", {
      waitUntil: "domcontentloaded",
    });

    const api = page.request;
    const now = Date.now();
    const estimateNumber = `E2E-${now}`;
    const clientName = `E2E Client ${now}`;

    // 1) Create sent estimate.
    const createEstimateRes = await api.post("/api/estimates", {
      headers: { Origin: "http://localhost:3000" },
      data: {
        clientName,
        clientEmail: `qa+${now}@example.com`,
        clientPhone: "+15550001111",
        address: "123 E2E St, Austin, TX 73301",
        services: [
          {
            id: "svc-1",
            name: "Concrete Work",
            qty: 1,
            unitPrice: 1200,
            price: 1200,
          },
        ],
        subtotal: 1200,
        tax: 0,
        total: 1200,
        estimateNumber,
        status: "sent",
      },
    });
    expect(createEstimateRes.ok()).toBeTruthy();
    const createdEstimate = await createEstimateRes.json();
    expect(createdEstimate?.success).toBeTruthy();

    const estimateId = createdEstimate?.data?.id;
    expect(estimateId).toBeTruthy();

    // 1) Approve estimate (should auto-convert to quote).
    const approveRes = await api.post(`/api/estimates/${estimateId}/respond`, {
      data: { action: "approved" },
    });
    const approveJson = await approveRes.json().catch(async () => ({
      raw: await approveRes.text(),
    }));
    if (!approveRes.ok()) {
      // eslint-disable-next-line no-console
      console.log("approve response", approveRes.status(), approveJson);
    }
    expect(approveRes.ok()).toBeTruthy();
    expect(approveJson?.success).toBeTruthy();
    expect(approveJson?.status).toBe("approved");

    // Read DB directly to assert quote creation + shared number base.
    const envLocal = loadDotEnvLocal();
    const supabaseUrl =
      process.env.SUPABASE_URL ||
      process.env.NEXT_PUBLIC_SUPABASE_URL ||
      envLocal.SUPABASE_URL ||
      envLocal.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = requireEnvValue("SUPABASE_SERVICE_ROLE_KEY", envLocal);
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const estimateTenantId = String(createdEstimate?.data?.tenantId || "");
    let quoteLookupQuery = supabase
      .from("quotes")
      .select("id, quote_number, quote_token, status, tenant_id")
      .eq("quote_number", estimateNumber)
      .order("created_at", { ascending: false })
      .limit(1);

    if (estimateTenantId) {
      quoteLookupQuery = quoteLookupQuery.eq("tenant_id", estimateTenantId);
    }

    const { data: quoteLookupRows, error: quoteLookupError } = await quoteLookupQuery;
    const quoteFromEstimate = Array.isArray(quoteLookupRows)
      ? quoteLookupRows[0] || null
      : null;

    expect(quoteLookupError).toBeNull();
    expect(quoteFromEstimate?.id).toBeTruthy();

    // 2) Base number must be preserved.
    expect(String(quoteFromEstimate.quote_number || "")).toBe(estimateNumber);

    // 3) Signed quote lock test via estimate-builder pipeline.
    const { data: someClient, error: clientError } = await supabase
      .from("clients")
      .select("id")
      .eq("tenant_id", quoteFromEstimate.tenant_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    expect(clientError).toBeNull();
    expect(someClient?.id).toBeTruthy();

    const ebCreateRes = await api.post("/api/estimate-builder", {
      data: {
        name: `EB Lock Test ${now}`,
        description: "Lock flow test",
        notes: "Lock flow test",
        client_id: someClient.id,
        lines: [
          {
            serviceId: "svc-lock-1",
            name: "Pavers",
            qty: 2,
            finalPrice: 300,
          },
        ],
        total_final: 600,
      },
    });
    expect(ebCreateRes.ok()).toBeTruthy();
    const ebCreateJson = await ebCreateRes.json();
    expect(ebCreateJson?.success).toBeTruthy();
    const ebId = ebCreateJson?.data?.id;
    expect(ebId).toBeTruthy();

    const shareRes = await api.post(`/api/estimate-builder/${ebId}/share-link`, {
      data: {},
    });
    const shareJson = await shareRes.json().catch(async () => ({
      raw: await shareRes.text(),
    }));
    if (!shareRes.ok()) {
      // eslint-disable-next-line no-console
      console.log("share response", shareRes.status(), shareJson);
    }
    expect(shareRes.ok()).toBeTruthy();
    expect(shareJson?.success).toBeTruthy();

    const ebQuoteToken =
      shareJson?.data?.quote?.quoteToken ||
      String(shareJson?.data?.quoteUrl || "").split("/").filter(Boolean).pop();
    expect(ebQuoteToken).toBeTruthy();

    const signRes = await api.post(`/api/public/quotes/${ebQuoteToken}/approval`, {
      data: {
        action: "sign",
        contactName: "E2E QA",
        contactEmail: `qa+${now}@example.com`,
        signatureText: "E2E QA Signature",
      },
    });
    expect(signRes.ok()).toBeTruthy();
    const signJson = await signRes.json();
    expect(signJson?.success).toBeTruthy();
    expect(signJson?.data?.quoteStatus).toBe("signed");

    // Editing without explicit unlock should fail with lock error.
    const ebPatchLockedRes = await api.patch(`/api/estimate-builder/${ebId}`, {
      headers: { Origin: "http://localhost:3000" },
      data: { notes: "Attempt edit while signed" },
    });
    const ebPatchLockedJson = await ebPatchLockedRes.json().catch(async () => ({
      raw: await ebPatchLockedRes.text(),
    }));
    if (ebPatchLockedRes.status() !== 409) {
      // eslint-disable-next-line no-console
      console.log("patch locked response", ebPatchLockedRes.status(), ebPatchLockedJson);
    }
    expect(ebPatchLockedRes.status()).toBe(409);
    expect(String(ebPatchLockedJson?.error || "").toLowerCase()).toContain("locked");

    // Editing with explicit unlock should succeed.
    const ebPatchUnlockRes = await api.patch(`/api/estimate-builder/${ebId}`, {
      headers: { Origin: "http://localhost:3000" },
      data: {
        notes: "Unlock + edit",
        removeQuoteSignature: true,
      },
    });
    expect(ebPatchUnlockRes.ok()).toBeTruthy();
    const ebPatchUnlockJson = await ebPatchUnlockRes.json();
    expect(ebPatchUnlockJson?.success).toBeTruthy();
  });
});
