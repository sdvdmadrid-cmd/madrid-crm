import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";

export const LOGO_PLACEMENT_VALUES = Object.freeze([
  "top-left",
  "top-right",
  "centered",
  "hidden",
]);

export function normalizeLogoPlacement(value) {
  const v = String(value || "").trim().toLowerCase();
  return LOGO_PLACEMENT_VALUES.includes(v) ? v : "top-left";
}

export const DEFAULT_COMPANY_PROFILE = {
  companyName: "",
  publicDisplayName: "",
  businessType: "",
  logoDataUrl: "",
  logoUrl: "",
  logoPlacement: "top-left",
  websiteUrl: "",
  googleReviewsUrl: "",
  phone: "",
  businessAddress: "",
  poBoxAddress: "",
  legalFooter: "",
  documentLanguage: "en",
  forceEnglishTranslation: false,
  defaultTaxState: "TX",
  defaultInvoiceDueDays: 14,
  serviceCatalogPreferences: {},
  // Paquete I: when set, estimates with total > this amount require a
  // typed customer signature on approval. null = no signature required.
  signatureRequiredAboveAmount: null,
};

function mapSupabaseRow(row = {}) {
  return {
    tenantId: row?.tenant_id || "",
    companyName: row?.company_name || "",
    publicDisplayName: row?.public_display_name || "",
    businessType: row?.business_type || "",
    logoDataUrl: row?.logo_data_url || "",
    logoUrl: row?.logo_url || "",
    logoPlacement: normalizeLogoPlacement(row?.logo_placement),
    websiteUrl: row?.website_url || "",
    googleReviewsUrl: row?.google_reviews_url || "",
    phone: row?.phone || "",
    businessAddress: row?.business_address || "",
    poBoxAddress: row?.po_box_address || "",
    legalFooter: row?.legal_footer || "",
    documentLanguage: row?.document_language || "en",
    forceEnglishTranslation: Boolean(row?.force_english_translation),
    defaultTaxState: row?.default_tax_state || "TX",
    defaultInvoiceDueDays: Number(row?.default_invoice_due_days || 14),
    serviceCatalogPreferences:
      row?.service_catalog_preferences &&
      typeof row.service_catalog_preferences === "object"
        ? row.service_catalog_preferences
        : {},
    signatureRequiredAboveAmount:
      row?.signature_required_above_amount === null ||
      row?.signature_required_above_amount === undefined ||
      row?.signature_required_above_amount === ""
        ? null
        : Number(row.signature_required_above_amount),
    updatedAt: row?.updated_at || null,
  };
}

export function isMissingColumnError(error, columnName) {
  const message = String(error?.message || error || "").toLowerCase();
  const column = String(columnName || "").toLowerCase();
  return (
    message.includes(column) &&
    (message.includes("schema cache") ||
      message.includes("does not exist") ||
      message.includes("could not find"))
  );
}

function toSupabaseRow(tenantId, profile = {}, userId, { includeExtendedColumns = true } = {}) {
  const row = {
    tenant_id: tenantId,
    company_name: profile.companyName || "",
    business_type: profile.businessType || "",
    updated_by: userId || null,
    updated_at: new Date().toISOString(),
  };

  if (!includeExtendedColumns) {
    return row;
  }

  return {
    ...row,
    public_display_name:
      profile.publicDisplayName || profile.companyName || "",
    logo_data_url: profile.logoDataUrl || "",
    logo_url: profile.logoUrl || "",
    logo_placement: normalizeLogoPlacement(profile.logoPlacement),
    website_url: profile.websiteUrl || "",
    google_reviews_url: profile.googleReviewsUrl || "",
    phone: profile.phone || "",
    business_address: profile.businessAddress || "",
    po_box_address: profile.poBoxAddress || "",
    legal_footer: profile.legalFooter || "",
    document_language: profile.documentLanguage || "en",
    force_english_translation: profile.forceEnglishTranslation === true,
    default_tax_state: profile.defaultTaxState || "TX",
    default_invoice_due_days: Number(profile.defaultInvoiceDueDays || 14),
    service_catalog_preferences:
      profile.serviceCatalogPreferences &&
      typeof profile.serviceCatalogPreferences === "object"
        ? profile.serviceCatalogPreferences
        : {},
    signature_required_above_amount:
      profile.signatureRequiredAboveAmount === null ||
      profile.signatureRequiredAboveAmount === undefined ||
      profile.signatureRequiredAboveAmount === ""
        ? null
        : Math.max(0, Number(profile.signatureRequiredAboveAmount) || 0),
  };
}

export async function getCompanyProfileByTenant({ tenantId }) {
  const { data, error } = await supabaseAdmin
    .from("company_profiles")
    .select("*")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return null;
  }

  return mapSupabaseRow(data);
}

/** Ensures website builder and AI routes never crash when profile row is missing. */
export function withDefaultCompanyProfile(profile, tenantId = "") {
  if (profile && typeof profile === "object") {
    return profile;
  }
  return {
    ...DEFAULT_COMPANY_PROFILE,
    tenantId: String(tenantId || "").trim(),
  };
}

export async function upsertCompanyProfileForTenant({
  tenantId,
  profile,
  userId,
}) {
  const payload = {
    ...toSupabaseRow(tenantId, profile, userId, { includeExtendedColumns: true }),
    created_by: userId || null,
  };

  let { data, error } = await supabaseAdmin
    .from("company_profiles")
    .upsert(payload, { onConflict: "tenant_id" })
    .select("*")
    .single();

  // Two graceful-degrade retries:
  //   1. Newer column (signature_required_above_amount) not yet applied →
  //      strip just that field and retry, so the rest of the profile saves.
  //   2. Whole extended-columns set missing → fall back to the minimal row
  //      (existing behavior).
  if (error && isMissingColumnError(error, "signature_required_above_amount")) {
    console.warn(
      "[company-profile-store] Retrying upsert without signature_required_above_amount",
      error.message,
    );
    const { signature_required_above_amount: _omit, ...withoutSignatureCol } = payload;
    void _omit;
    ({ data, error } = await supabaseAdmin
      .from("company_profiles")
      .upsert(withoutSignatureCol, { onConflict: "tenant_id" })
      .select("*")
      .single());
  }

  if (error && isMissingColumnError(error, "public_display_name")) {
    console.warn(
      "[company-profile-store] Retrying upsert without extended columns",
      error.message,
    );
    const minimalPayload = {
      ...toSupabaseRow(tenantId, profile, userId, {
        includeExtendedColumns: false,
      }),
      created_by: userId || null,
    };
    ({ data, error } = await supabaseAdmin
      .from("company_profiles")
      .upsert(minimalPayload, { onConflict: "tenant_id" })
      .select("*")
      .single());
  }

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return {
      ...DEFAULT_COMPANY_PROFILE,
      tenantId,
      ...(profile || {}),
    };
  }

  return mapSupabaseRow(data);
}
