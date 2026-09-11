import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  buildWinOnSitePackages,
  computeDepositAmount,
  normalizeWinOnSitePackageTier,
  selectWinOnSitePackage,
  serializeWinOnSitePackagesForPublic,
  WIN_ON_SITE_DEPOSIT_PERCENT,
} from "../../src/lib/win-on-site-packages.js";

const root = process.cwd();

test("package tiers scale good/better/best from base draft", () => {
  const packages = buildWinOnSitePackages({
    title: "Concrete patio",
    subtotal: 4000,
    services: [{ id: "1", name: "Patio", qty: 1, unitPrice: 4000, price: 4000 }],
  });
  assert.equal(packages.good.total, 3400);
  assert.equal(packages.better.total, 4000);
  assert.equal(packages.best.total, 5000);
  assert.equal(packages.better.depositPercent, WIN_ON_SITE_DEPOSIT_PERCENT);
  assert.equal(packages.better.depositAmount, computeDepositAmount(4000));
  assert.equal(computeDepositAmount(4000), 1000);
});

test("normalize and select package tier defaults to better", () => {
  const packages = buildWinOnSitePackages({
    services: [{ name: "Job", qty: 1, unitPrice: 1000, price: 1000 }],
    subtotal: 1000,
  });
  assert.equal(normalizeWinOnSitePackageTier("BEST"), "best");
  assert.equal(normalizeWinOnSitePackageTier("nope"), "better");
  assert.equal(selectWinOnSitePackage(packages, "good").tier, "good");
  assert.equal(selectWinOnSitePackage(packages, "weird").tier, "better");
});

test("public package serialization hides unit prices", () => {
  const packages = buildWinOnSitePackages({
    title: "Driveway",
    services: [{ name: "Pour", qty: 2, unitPrice: 500, price: 1000 }],
    subtotal: 1000,
  });
  const publicPkgs = serializeWinOnSitePackagesForPublic(packages);
  assert.equal(publicPkgs.better.services[0].price, 1000);
  assert.equal(publicPkgs.better.services[0].unitPrice, undefined);
  assert.equal(publicPkgs.better.estimated, true);
});

test("contact and packages routes wire Phase 2 deposit flow", () => {
  const contact = readFileSync(
    path.join(root, "src/app/api/site/[slug]/contact/route.js"),
    "utf8",
  );
  const packagesRoute = readFileSync(
    path.join(root, "src/app/api/site/[slug]/win-on-site/packages/route.js"),
    "utf8",
  );
  const stripe = readFileSync(path.join(root, "src/lib/stripe-payments.js"), "utf8");
  const form = readFileSync(
    path.join(root, "src/components/site/PremiumLeadForm.jsx"),
    "utf8",
  );

  assert.match(contact, /createWinOnSiteDepositCheckout/);
  assert.match(contact, /packageTier/);
  assert.match(contact, /checkoutUrl/);
  assert.match(packagesRoute, /buildWinOnSitePackages/);
  assert.match(stripe, /createStripeCheckoutSessionForInvoice/);
  assert.match(form, /STEPS = 5/);
  assert.match(form, /packageTier/);
  assert.match(form, /win-on-site\/packages/);
});
