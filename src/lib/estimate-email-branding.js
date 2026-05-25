import { supabaseAdmin } from "@/lib/supabase-admin";

const ALLOWED_PLACEMENT = new Set([
  "top_left",
  "top_center",
  "top_right",
]);

function sanitizeLogoUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  // Allow HTTPS-hosted logos and inline data URLs (legacy storage).
  if (raw.startsWith("https://") || raw.startsWith("data:image/")) {
    return raw;
  }
  return "";
}

function sanitizePlacement(value) {
  const raw = String(value || "").trim().toLowerCase();
  return ALLOWED_PLACEMENT.has(raw) ? raw : "top_left";
}

/**
 * Fetch the contractor's branding (company name + logo URL + placement) for
 * a single tenant, with graceful fallbacks. Returns null fields instead of
 * throwing so the estimate email flow can always send something even if the
 * profile row is missing or the columns from issue #40 are not yet applied.
 */
export async function getEstimateBrandingByTenant(tenantId) {
  const fallback = {
    companyName: "",
    logoUrl: "",
    logoPlacement: "top_left",
  };

  const id = String(tenantId || "").trim();
  if (!id) return fallback;

  try {
    const { data, error } = await supabaseAdmin
      .from("company_profiles")
      .select("company_name, logo_url, logo_data_url, logo_placement")
      .eq("tenant_id", id)
      .maybeSingle();

    if (error || !data) return fallback;

    return {
      companyName: String(data.company_name || "").trim(),
      logoUrl:
        sanitizeLogoUrl(data.logo_url) || sanitizeLogoUrl(data.logo_data_url),
      logoPlacement: sanitizePlacement(data.logo_placement),
    };
  } catch (err) {
    console.warn("[estimate-email-branding] failed to load profile", {
      tenantId: id,
      error: err?.message || String(err),
    });
    return fallback;
  }
}

/**
 * Render a small HTML header that places the contractor logo above the
 * estimate body. When no logo is configured the function returns an empty
 * string so the email stays clean.
 */
export function renderLogoEmailHeader({ logoUrl, logoPlacement, companyName }) {
  if (!logoUrl) return "";

  const placement = ALLOWED_PLACEMENT.has(logoPlacement)
    ? logoPlacement
    : "top_left";
  const align =
    placement === "top_right"
      ? "right"
      : placement === "top_center"
        ? "center"
        : "left";

  const alt = companyName
    ? `${companyName.replace(/"/g, "&quot;")} logo`
    : "Company logo";

  return `
    <div style="text-align:${align};margin-bottom:16px">
      <img src="${logoUrl}" alt="${alt}" style="max-height:64px;max-width:240px;display:inline-block;object-fit:contain"/>
    </div>
  `;
}
