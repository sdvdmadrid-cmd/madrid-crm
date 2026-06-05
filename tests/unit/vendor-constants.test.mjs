import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeVendorCategory,
  vendorCategoryLabel,
  VENDOR_CATEGORIES,
} from "../../src/lib/vendor-constants.js";

describe("vendor-constants", () => {
  it("supports material store category without predefined supplier names", () => {
    assert.equal(normalizeVendorCategory("material_store"), "material_store");
    assert.equal(vendorCategoryLabel("material_store"), "Material Stores");
  });

  it("falls back unknown categories to other", () => {
    assert.equal(normalizeVendorCategory("siteone"), "other");
    assert.equal(normalizeVendorCategory(""), "other");
  });

  it("includes flexible contractor vendor categories", () => {
    const ids = VENDOR_CATEGORIES.map((c) => c.id);
    assert.ok(ids.includes("subcontractor"));
    assert.ok(ids.includes("dump_site"));
    assert.ok(ids.includes("nursery"));
    assert.ok(!ids.includes("utilities"));
  });
});
