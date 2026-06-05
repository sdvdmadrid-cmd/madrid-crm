import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computePayPreview,
  normalizeStandardWeeklyHours,
} from "../../src/lib/payroll-pay-preview.js";

describe("payroll-pay-preview", () => {
  it("computes hourly annual from configured weekly hours", () => {
    const preview = computePayPreview("hourly", 25, 0, {
      standardWeeklyHours: 40,
    });
    assert.equal(preview.grossAnnual, 52000);
    assert.equal(preview.weekly, 1000);
    assert.equal(preview.biweekly, 2000);
  });

  it("uses custom weekly hours from payroll settings", () => {
    const preview = computePayPreview("hourly", 25, 0, {
      standardWeeklyHours: 32,
    });
    assert.equal(preview.grossAnnual, 41600);
    assert.equal(preview.weekly, 800);
    assert.equal(preview.biweekly, 1600);
    assert.equal(preview.standardWeeklyHours, 32);
  });

  it("computes salary preview", () => {
    const preview = computePayPreview("salary", 0, 52000);
    assert.equal(preview.grossAnnual, 52000);
    assert.equal(preview.weekly, 1000);
    assert.equal(preview.biweekly, 2000);
  });

  it("adjusts per-pay-period amount for monthly schedule", () => {
    const preview = computePayPreview("salary", 0, 12000, {
      defaultPaySchedule: "monthly",
    });
    assert.equal(preview.biweekly, 1000);
    assert.equal(preview.periodsPerYear, 12);
  });

  it("returns zeroes for empty input", () => {
    const preview = computePayPreview("hourly", "", "");
    assert.equal(preview.grossAnnual, 0);
    assert.equal(preview.weekly, 0);
    assert.equal(preview.biweekly, 0);
  });

  it("normalizes invalid weekly hours", () => {
    assert.equal(normalizeStandardWeeklyHours(undefined), 40);
    assert.equal(normalizeStandardWeeklyHours(-5), 40);
    assert.equal(normalizeStandardWeeklyHours(200), 168);
  });
});
