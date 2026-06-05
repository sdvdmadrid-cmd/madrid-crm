import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildRunLineFromTimeEntries } from "../../src/lib/payroll-time-utils.js";

describe("payroll-time-utils", () => {
  it("builds run lines with overtime auto-split from tenant settings", () => {
    const line = buildRunLineFromTimeEntries(
      [{ employeeId: "emp-1", hours: 90, entryType: "regular", hourlyRate: 25 }],
      { standardWeeklyHours: 40, autoSplitOvertime: true },
      "biweekly",
    );

    assert.equal(line.hoursRegular, 80);
    assert.equal(line.hoursOvertime, 10);
    assert.equal(line.autoSplitApplied, true);
    assert.equal(line.hourlyRate, 25);
  });

  it("keeps all hours regular when auto-split is disabled", () => {
    const line = buildRunLineFromTimeEntries(
      [{ employeeId: "emp-1", hours: 90, entryType: "regular", hourlyRate: 20 }],
      { standardWeeklyHours: 40, autoSplitOvertime: false },
      "biweekly",
    );

    assert.equal(line.hoursRegular, 90);
    assert.equal(line.hoursOvertime, 0);
    assert.equal(line.autoSplitApplied, false);
  });
});
