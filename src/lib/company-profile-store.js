import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";

export const DEFAULT_COMPANY_PROFILE = {
  companyName: "",
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

function toSupabaseRow(tenantId, profile = {}, userId) {
  return {
    tenant_id: tenantId,
    company_name: profile.companyName || "",
    business_type: profile.businessType || "",
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
    updated_by: userId || null,
    updated_at: new Date().toISOString(),
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
  const supabaseRow = toSupabaseRow(tenantId, profile, userId);

  const { data, error } = await supabaseAdmin
    .from("company_profiles")
    .upsert(
      {
        ...supabaseRow,
        created_by: userId || null,
      },
      { onConflict: "tenant_id" },
    )
    .select("*")
    .single();

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
