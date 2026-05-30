const { test, expect } = require("@playwright/test");
const { devLogin } = require("./helpers/auth");
const { createClient } = require("@supabase/supabase-js");
const fs = require("node:fs");
const path = require("node:path");

const ORIGIN_HEADERS = { Origin: "http://localhost:3000" };

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

async function ensureLegalAccepted(api) {
  const originHeaders = { Origin: "http://localhost:3000" };

  const statusRes = await api.get("/api/legal/status", { headers: originHeaders });
  const statusJson = await statusRes.json().catch(() => null);
  if (statusRes.ok() && statusJson?.data?.accepted) {
    return;
  }

  const versionRes = await api.get("/api/legal/version", { headers: originHeaders });
  const versionJson = await versionRes.json().catch(() => null);
  const version = String(versionJson?.data?.version || "").trim();

  const acceptRes = await api.post("/api/legal/accept", {
    headers: {
      ...originHeaders,
      "Content-Type": "application/json",
    },
    data: version ? { version } : {},
  });
  expect(acceptRes.ok()).toBeTruthy();
}

async function postWithTransientRetry(api, page, url, data, options = {}) {
  const {
    retries = 3,
    retryDelayMs = 500,
    shouldRetry = (status, body) =>
      status === 500 && String(body?.error || body?.raw || "").toLowerCase().includes("fetch failed"),
  } = options;

  let lastRes = null;
  let lastBody = null;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const res = await api.post(url, { data });
    const parsed = await res.json().catch(async () => ({
      raw: await res.text(),
    }));

    if (res.ok() || attempt === retries || !shouldRetry(res.status(), parsed)) {
      return { res, body: parsed };
    }

    lastRes = res;
    lastBody = parsed;
    await page.waitForTimeout(retryDelayMs * attempt);
  }

  return { res: lastRes, body: lastBody };
}

test.describe("Estimate -> Quote flow checks (1,2,3)", () => {
  test("approval auto-converts, base number preserved, signed quote lock works", async ({ page }) => {
    test.setTimeout(90_000);
    await devLogin(page, { profile: "admin", redirect: "/dashboard" });

    const api = page.request;

    const now = Date.now();
    const estimateNumber = `E2E-${now}`;
    const clientName = `E2E Client ${now}`;

    // 1) Create sent estimate.
    const createEstimateRes = await api.post("/api/estimates", {
      headers: ORIGIN_HEADERS,
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
    const publicLink = String(createdEstimate?.data?.publicLink || "");
    const publicAccessToken = (() => {
      try {
        return new URL(publicLink, "http://localhost:3000").searchParams.get("token");
      } catch {
        return "";
      }
    })();
    expect(estimateId).toBeTruthy();
    expect(publicAccessToken).toBeTruthy();

    // 1) Approve estimate (should auto-convert to quote).
    const { res: approveRes, body: approveJson } = await postWithTransientRetry(
      api,
      page,
      `/api/estimates/${estimateId}/respond`,
      { action: "approved", token: publicAccessToken },
    );
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
    // Ensure 'quoteFromEstimate' is defined before accessing its properties
    expect(quoteFromEstimate).toBeTruthy();
    expect(quoteFromEstimate?.id).toBeTruthy();

    // 2) Base number must be preserved.
    expect(String(quoteFromEstimate?.quote_number || "")).toBe(estimateNumber);

    // 3) Signed quote lock on the unified /api/estimates pipeline.
    const quoteToken = String(quoteFromEstimate?.quote_token || "").trim();
    expect(quoteToken).toBeTruthy();

    const signRes = await api.post(`/api/public/quotes/${quoteToken}/approval`, {
      data: {
        action: "sign",
        contactName: "E2E QA",
        contactEmail: `qa+${now}@example.com`,
        signatureText: "E2E QA Signature",
        acceptElectronicConsent: true,
      },
    });
    const signJson = await signRes.json().catch(async () => ({
      raw: await signRes.text(),
    }));
    if (!signRes.ok()) {
      // eslint-disable-next-line no-console
      console.log("sign response", signRes.status(), signJson);
    }
    expect(signRes.ok()).toBeTruthy();
    expect(signJson?.success).toBeTruthy();
    expect(signJson?.data?.quoteStatus).toBe("signed");

    const patchLockedRes = await api.patch(`/api/estimates/${estimateId}`, {
      headers: ORIGIN_HEADERS,
      data: { notes: "Attempt edit while signed" },
    });
    const patchLockedJson = await patchLockedRes.json().catch(async () => ({
      raw: await patchLockedRes.text(),
    }));
    if (patchLockedRes.status() !== 409) {
      // eslint-disable-next-line no-console
      console.log("patch locked response", patchLockedRes.status(), patchLockedJson);
    }
    expect(patchLockedRes.status()).toBe(409);
    expect(String(patchLockedJson?.error || "").toLowerCase()).toContain("locked");

    const patchUnlockRes = await api.patch(`/api/estimates/${estimateId}`, {
      headers: ORIGIN_HEADERS,
      data: {
        notes: "Unlock + edit",
        removeQuoteSignature: true,
      },
    });
    expect(patchUnlockRes.ok()).toBeTruthy();
    const patchUnlockJson = await patchUnlockRes.json();
    expect(patchUnlockJson?.success).toBeTruthy();
  });
});
