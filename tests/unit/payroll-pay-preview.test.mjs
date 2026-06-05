import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computePayPreview } from "../../src/lib/payroll-pay-preview.js";

describe("payroll-pay-preview", () => {
  it("computes hourly annual from 40hr/week baseline", () => {
    const preview = computePayPreview("hourly", 25, 0);
    assert.equal(preview.grossAnnual, 52000);
    assert.equal(preview.weekly, 1000);
    assert.equal(preview.biweekly, 2000);
  });

  it("computes salary preview", () => {
    const preview = computePayPreview("salary", 0, 52000);
    assert.equal(preview.grossAnnual, 52000);
    assert.equal(preview.weekly, 1000);
    assert.equal(preview.biweekly, 2000);
  });

  it("returns zeroes for empty input", () => {
    const preview = computePayPreview("hourly", "", "");
    assert.equal(preview.grossAnnual, 0);
    assert.equal(preview.weekly, 0);
    assert.equal(preview.biweekly, 0);
  });
});
