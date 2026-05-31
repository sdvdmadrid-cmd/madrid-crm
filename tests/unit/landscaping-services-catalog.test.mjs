import test from "node:test";
import assert from "node:assert/strict";
import {
  LANDSCAPING_REQUEST_SERVICE_OPTIONS,
  buildLandscapingDefaultServices,
  getLandscapingRequestServiceOptions,
  isLandscapingIndustryKey,
} from "../../src/lib/landscaping-services-catalog.js";
import {
  resolveWebsiteRequestServices,
  filterHomeownerFacingServices,
  isAllowedRequestService,
  LEAD_SERVICE_OTHER,
} from "../../src/lib/website-lead-form.js";

test("landscaping catalog includes full quote dropdown", () => {
  assert.ok(LANDSCAPING_REQUEST_SERVICE_OPTIONS.length >= 30);
  assert.ok(LANDSCAPING_REQUEST_SERVICE_OPTIONS.includes("Paver Patio Installation"));
  assert.ok(LANDSCAPING_REQUEST_SERVICE_OPTIONS.includes("Other"));
});

test("landscaping default services omit pricing", () => {
  const services = buildLandscapingDefaultServices();
  assert.ok(services.length >= 12);
  for (const service of services) {
    assert.ok(service.name);
    assert.equal(service.price, undefined);
    assert.ok(!String(service.description || "").includes("From $"));
  }
});

test("resolveWebsiteRequestServices prefers landscaping catalog", () => {
  const options = resolveWebsiteRequestServices({
    industryKey: "landscaping_hardscaping",
    services: [{ name: "Lawn Maintenance" }],
    requestServices: ["Yard Cleanup"],
  });
  assert.deepEqual(options, getLandscapingRequestServiceOptions());
});

test("filterHomeownerFacingServices strips displayed prices", () => {
  const list = filterHomeownerFacingServices([
    { name: "Mulch Installation", description: "Fresh beds", price: "From $299" },
  ]);
  assert.equal(list.length, 1);
  assert.equal(list[0].price, undefined);
});

test("isLandscapingIndustryKey recognizes aliases", () => {
  assert.equal(isLandscapingIndustryKey("landscaping"), true);
  assert.equal(isLandscapingIndustryKey("landscaping_hardscaping"), true);
  assert.equal(isLandscapingIndustryKey("cleaning"), false);
});

test("resolveWebsiteRequestServices adds Other and accepts custom service text", () => {
  const options = resolveWebsiteRequestServices({
    industryKey: "landscaping_hardscaping",
  });
  assert.ok(options.includes(LEAD_SERVICE_OTHER));
  assert.equal(isAllowedRequestService("Custom pergola build", options), true);
  assert.equal(isAllowedRequestService("", options), false);
});

test("resolveWebsiteRequestServices uses business type for landscaping", () => {
  const options = resolveWebsiteRequestServices({
    industryKey: "general",
    businessType: "Landscaping & Lawn Care",
  });
  assert.ok(options.length >= 30);
});
