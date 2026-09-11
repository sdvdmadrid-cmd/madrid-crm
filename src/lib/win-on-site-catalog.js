import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { buildWinOnSitePackages } from "@/lib/win-on-site-packages";
import {
  buildWinOnSitePackagesFromCatalog,
  matchCatalogServices,
} from "@/lib/win-on-site-catalog-helpers";

const CATALOG_LIMIT = 80;

export {
  buildWinOnSitePackagesFromCatalog,
  matchCatalogServices,
} from "@/lib/win-on-site-catalog-helpers";

export async function loadTenantServicesCatalog(tenantId) {
  const tid = String(tenantId || "").trim();
  if (!tid) return [];
  const { data, error } = await supabaseAdmin
    .from("services_catalog")
    .select(
      "id, name, description, category, unit, price_min, price_max, pricing_type",
    )
    .eq("tenant_id", tid)
    .order("name", { ascending: true })
    .limit(CATALOG_LIMIT);
  if (error) {
    console.warn("[win-on-site-catalog] load failed", error.message);
    return [];
  }
  return Array.isArray(data) ? data : [];
}

/**
 * Prefer catalog packages; soft-fail to draft multipliers.
 */
export async function resolveWinOnSitePackages({
  tenantId,
  serviceNeeded = "",
  description = "",
  baseDraft = {},
  areaSqFt = null,
} = {}) {
  try {
    const rows = await loadTenantServicesCatalog(tenantId);
    const matched = matchCatalogServices(rows, { serviceNeeded, description });
    const catalogPackages = buildWinOnSitePackagesFromCatalog(matched, {
      serviceNeeded,
      areaSqFt,
    });
    if (catalogPackages?.better?.total > 0) {
      const catalogItemIds = [
        ...new Set(
          ["good", "better", "best"].flatMap(
            (tier) => catalogPackages[tier]?.catalogItemIds || [],
          ),
        ),
      ];
      return {
        packages: catalogPackages,
        pricingSource: "catalog",
        catalogItemIds,
      };
    }
  } catch (error) {
    console.warn(
      "[win-on-site-catalog] resolve soft-fail",
      error?.message || error,
    );
  }

  const packages = buildWinOnSitePackages(baseDraft);
  return {
    packages,
    pricingSource: "multiplier",
    catalogItemIds: [],
  };
}
