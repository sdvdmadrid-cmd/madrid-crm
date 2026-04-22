import {
  DEFAULT_COMPANY_PROFILE,
  getCompanyProfileByTenant,
  upsertCompanyProfileForTenant,
} from "@/lib/company-profile-store";
import {
  canManageSensitive,
  forbiddenResponse,
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";

const ALLOWED_DOCUMENT_LANGUAGES = new Set(["en", "es", "pl"]);

const ALLOWED_US_TAX_STATES = new Set([
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DE",
  "FL",
  "GA",
  "HI",
  "ID",
  "IL",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MA",
  "MI",
  "MN",
  "MS",
  "MO",
  "MT",
  "NE",
  "NV",
  "NH",
  "NJ",
  "NM",
  "NY",
  "NC",
  "ND",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VT",
  "VA",
  "WA",
  "WV",
  "WI",
  "WY",
  "DC",
]);

function toStringValue(value) {
  return String(value || "").trim();
}

function toLimitedText(value, limit) {
  return toStringValue(value).slice(0, limit);
}

function normalizeUrl(value) {
  const input = toStringValue(value);
  if (!input) return "";

  if (/^https?:\/\//i.test(input)) {
    return input;
  }

  return `https://${input}`;
}

function sanitizeLogo(value) {
  const input = toStringValue(value);
  if (!input) return "";
  if (!input.startsWith("data:image/")) return "";

  // Limit oversized payloads (about 2MB raw image data).
  if (input.length > 2_800_000) return "";
  return input;
}

function normalizeLanguage(value) {
  const input = toStringValue(value).toLowerCase();
  return ALLOWED_DOCUMENT_LANGUAGES.has(input) ? input : "en";
}

function toBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  const normalized = toStringValue(value).toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

function normalizeTaxState(value) {
  const input = toStringValue(value).toUpperCase();
  return ALLOWED_US_TAX_STATES.has(input) ? input : "TX";
}

function normalizeInvoiceDueDays(value) {
  const parsed = Number.parseInt(String(value || "14"), 10);
  if (!Number.isFinite(parsed)) return 14;
  return Math.max(1, Math.min(120, parsed));
}

export async function GET(request) {
  try {
    const { tenantDbId, authenticated } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) {
      return unauthenticatedResponse();
    }

    const data = await getCompanyProfileByTenant({ tenantId: tenantDbId });

    return new Response(
      JSON.stringify({
        success: true,
        data: data
          ? data
          : { ...DEFAULT_COMPANY_PROFILE, tenantId: tenantDbId },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("[api/company-profile][GET] error", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

export async function PATCH(request) {
  try {
    const { tenantDbId, role, userId, authenticated } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) {
      return unauthenticatedResponse();
    }

    if (!canManageSensitive(role)) {
      return forbiddenResponse();
    }

    const body = await request.json();
    const now = new Date();

    const update = {
      companyName: toLimitedText(body.companyName, 120),
      businessType: toLimitedText(body.businessType || body.industry, 80),
      logoDataUrl: sanitizeLogo(body.logoDataUrl),
      websiteUrl: normalizeUrl(body.websiteUrl),
      googleReviewsUrl: normalizeUrl(body.googleReviewsUrl),
      phone: toLimitedText(body.phone, 60),
      businessAddress: toLimitedText(body.businessAddress, 280),
      poBoxAddress: toLimitedText(body.poBoxAddress, 280),
      legalFooter: toLimitedText(body.legalFooter, 500),
      documentLanguage: normalizeLanguage(body.documentLanguage),
      forceEnglishTranslation: toBoolean(body.forceEnglishTranslation),
      defaultTaxState: normalizeTaxState(body.defaultTaxState),
      defaultInvoiceDueDays: normalizeInvoiceDueDays(
        body.defaultInvoiceDueDays,
      ),
      updatedAt: now,
      updatedBy: userId,
    };

    const saved = await upsertCompanyProfileForTenant({
      tenantId: tenantDbId,
      profile: update,
      userId,
    });

    return new Response(JSON.stringify({ success: true, data: saved }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[api/company-profile][PATCH] error", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
