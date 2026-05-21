import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";

export const DEFAULT_COMPANY_PROFILE = {
  companyName: "",
  publicDisplayName: "",
  businessType: "",
  logoDataUrl: "",
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
};

function mapSupabaseRow(row = {}) {
  return {
    tenantId: row?.tenant_id || "",
    companyName: row?.company_name || "",
    publicDisplayName: row?.public_display_name || "",
    businessType: row?.business_type || "",
    logoDataUrl: row?.logo_data_url || "",
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
    updatedAt: row?.updated_at || null,
  };
}

function isMissingColumnError(error, columnName) {
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
