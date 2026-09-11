import { scoreTextMatch } from "./text-match.js";
import {
  computeDepositAmount,
  roundMoney,
  WIN_ON_SITE_DEPOSIT_PERCENT,
  WIN_ON_SITE_PACKAGE_TIERS,
} from "./win-on-site-packages.js";

export const WIN_ON_SITE_CATALOG_MATCH_THRESHOLD = 35;

function isAreaUnit(unit) {
  const u = String(unit || "").toLowerCase();
  return /sq\.?\s*f|sqft|square\s*f|sf\b/.test(u);
}

function tierUnitPrice(row, tier) {
  const min = Math.max(0, Number(row.price_min) || 0);
  const max = Math.max(0, Number(row.price_max) || 0);
  if (tier === "good") return min || max;
  if (tier === "best") return max || min;
  if (min > 0 && max > 0) return (min + max) / 2;
  return min || max;
}

function resolveQty(row, areaSqFt) {
  if (areaSqFt && isAreaUnit(row.unit) && areaSqFt > 0) {
    return Math.max(1, Math.round(areaSqFt));
  }
  return 1;
}

function scoreCatalogRow(row, serviceNeeded, description) {
  const name = String(row.name || "");
  const category = String(row.category || "");
  const desc = String(row.description || "");
  const serviceScore = Math.max(
    scoreTextMatch(name, serviceNeeded),
    scoreTextMatch(category, serviceNeeded),
    scoreTextMatch(`${name} ${category}`, serviceNeeded),
  );
  const detailScore = description
    ? Math.max(
        scoreTextMatch(name, description),
        scoreTextMatch(desc, description),
      ) * 0.5
    : 0;
  return Math.round(serviceScore + detailScore);
}

export function matchCatalogServices(rows, { serviceNeeded = "", description = "" } = {}) {
  const scored = (Array.isArray(rows) ? rows : [])
    .map((row) => ({
      row,
      score: scoreCatalogRow(row, serviceNeeded, description),
    }))
    .filter((entry) => entry.score >= WIN_ON_SITE_CATALOG_MATCH_THRESHOLD)
    .sort((a, b) => b.score - a.score);
  return scored.map((entry) => entry.row);
}

function buildCatalogTierPackage(tier, primary, secondary, areaSqFt, title) {
  const labels = { good: "Good", better: "Better", best: "Best" };
  const highlights = {
    good: [
      "Essential catalog scope",
      "Standard materials from your price book",
      areaSqFt ? `Approx. area: ${areaSqFt.toLocaleString()} sq ft` : "Estimated quantity",
    ],
    better: [
      "Recommended catalog pricing",
      "Quality finish aligned to your rates",
      "Includes cleanup",
    ],
    best: [
      "Premium catalog upgrade",
      "Priority scheduling preference",
      secondary ? `Includes: ${secondary.name}` : "Extended workmanship care",
    ],
  };

  const services = [];
  const qty = resolveQty(primary, areaSqFt);
  const unitPrice = roundMoney(tierUnitPrice(primary, tier));
  const price = roundMoney(qty * unitPrice);
  services.push({
    id: `catalog_${primary.id}_${tier}`,
    name: String(primary.name || "Service").slice(0, 200),
    qty,
    unitPrice,
    price,
    notes: String(primary.unit || "").slice(0, 80),
    catalogItemId: primary.id,
  });

  if (tier === "best" && secondary && secondary.id !== primary.id) {
    const extraQty = 1;
    const extraUnit = roundMoney(
      tierUnitPrice(secondary, "good") || tierUnitPrice(secondary, "better"),
    );
    const extraPrice = roundMoney(extraQty * extraUnit);
    if (extraPrice > 0) {
      services.push({
        id: `catalog_${secondary.id}_${tier}_extra`,
        name: String(secondary.name || "Upgrade").slice(0, 200),
        qty: extraQty,
        unitPrice: extraUnit,
        price: extraPrice,
        notes: "Catalog upgrade",
        catalogItemId: secondary.id,
      });
    }
  }

  const total = roundMoney(services.reduce((sum, s) => sum + (s.price || 0), 0));
  return {
    tier,
    label: labels[tier],
    multiplier: null,
    highlights: highlights[tier],
    title: String(title || primary.name || "Service package").slice(0, 200),
    services,
    total,
    depositPercent: WIN_ON_SITE_DEPOSIT_PERCENT,
    depositAmount: computeDepositAmount(total, WIN_ON_SITE_DEPOSIT_PERCENT),
    estimated: true,
    pricingSource: "catalog",
    catalogItemIds: services.map((s) => s.catalogItemId).filter(Boolean),
  };
}

/**
 * Build Good/Better/Best from catalog matches. Returns null if no usable prices.
 */
export function buildWinOnSitePackagesFromCatalog(
  matchedRows = [],
  { serviceNeeded = "", areaSqFt = null } = {},
) {
  const usable = (Array.isArray(matchedRows) ? matchedRows : []).filter((row) => {
    const min = Number(row.price_min) || 0;
    const max = Number(row.price_max) || 0;
    return min > 0 || max > 0;
  });
  if (!usable.length) return null;

  const primary = usable[0];
  const secondary = usable[1] || null;
  const title = serviceNeeded || primary.name || "Service package";
  const packages = {};
  for (const tier of WIN_ON_SITE_PACKAGE_TIERS) {
    packages[tier] = buildCatalogTierPackage(
      tier,
      primary,
      secondary,
      areaSqFt,
      title,
    );
  }
  return packages;
}
