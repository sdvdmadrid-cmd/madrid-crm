import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

import { scoreTextMatch } from "../../src/lib/text-match.js";
import {
  approxAreaSqFtFromBounds,
  normalizeMapMarkup,
} from "../../src/lib/win-on-site-map.js";
import {
  buildWinOnSitePackagesFromCatalog,
  matchCatalogServices,
} from "../../src/lib/win-on-site-catalog-helpers.js";
import { WIN_ON_SITE_PHASE } from "../../src/lib/win-on-site-helpers.js";

const root = process.cwd();

test("phase 6 marks win-on-site phase", () => {
  assert.equal(WIN_ON_SITE_PHASE, 6);
});

test("normalizeMapMarkup accepts pin + bounds area", () => {
  const pin = normalizeMapMarkup({ lat: 29.76, lng: -95.37 });
  assert.equal(pin.lat, 29.76);
  assert.equal(pin.lng, -95.37);

  const withArea = normalizeMapMarkup({
    lat: 29.76,
    lng: -95.37,
    bounds: { north: 29.761, south: 29.759, east: -95.369, west: -95.371 },
    areaSqFt: 1200,
  });
  assert.equal(withArea.areaSqFt, 1200);
  assert.ok(withArea.bounds);

  assert.equal(normalizeMapMarkup(null), null);
  assert.equal(normalizeMapMarkup({ lat: 999, lng: 0 }), null);
});

test("approxAreaSqFtFromBounds returns positive area", () => {
  const area = approxAreaSqFtFromBounds({
    north: 29.761,
    south: 29.76,
    east: -95.369,
    west: -95.37,
  });
  assert.ok(area > 100);
});

test("catalog matcher scores service names and builds good/better/best", () => {
  assert.ok(scoreTextMatch("Concrete patio", "concrete") >= 70);
  const rows = [
    {
      id: "a",
      name: "Concrete patio",
      category: "concrete",
      description: "Stamped patio",
      unit: "sq ft",
      price_min: 8,
      price_max: 14,
    },
    {
      id: "b",
      name: "Sealing upgrade",
      category: "concrete",
      unit: "job",
      price_min: 250,
      price_max: 400,
    },
  ];
  const matched = matchCatalogServices(rows, {
    serviceNeeded: "Concrete patio",
    description: "Need stamped patio",
  });
  assert.ok(matched.length >= 1);
  assert.equal(matched[0].id, "a");

  const packages = buildWinOnSitePackagesFromCatalog(matched, {
    serviceNeeded: "Concrete patio",
    areaSqFt: 200,
  });
  assert.ok(packages);
  assert.equal(packages.good.pricingSource, "catalog");
  assert.ok(packages.good.total > 0);
  assert.ok(packages.better.total >= packages.good.total);
  assert.ok(packages.best.total >= packages.better.total);
  assert.equal(packages.better.services[0].qty, 200);
});

test("catalog soft-fails to null without prices", () => {
  const packages = buildWinOnSitePackagesFromCatalog(
    [{ id: "x", name: "Mystery", price_min: 0, price_max: 0 }],
    { serviceNeeded: "Mystery" },
  );
  assert.equal(packages, null);
});

test("phase 6 wires map + catalog into form and routes", () => {
  const form = readFileSync(
    path.join(root, "src/components/site/PremiumLeadForm.jsx"),
    "utf8",
  );
  const mapComponent = readFileSync(
    path.join(root, "src/components/site/LeadMapMarkup.jsx"),
    "utf8",
  );
  const packagesRoute = readFileSync(
    path.join(root, "src/app/api/site/[slug]/win-on-site/packages/route.js"),
    "utf8",
  );
  const contact = readFileSync(
    path.join(root, "src/app/api/site/[slug]/contact/route.js"),
    "utf8",
  );
  const leadForm = readFileSync(
    path.join(root, "src/lib/website-lead-form.js"),
    "utf8",
  );

  assert.match(form, /LeadMapMarkup/);
  assert.match(form, /mapMarkup/);
  assert.match(mapComponent, /NEXT_PUBLIC_GOOGLE_MAPS_API_KEY/);
  assert.match(mapComponent, /DrawingManager/);
  assert.match(packagesRoute, /resolveWinOnSitePackages/);
  assert.match(packagesRoute, /pricingSource/);
  assert.match(contact, /mapMarkup/);
  assert.match(leadForm, /mapMarkup/);
});
