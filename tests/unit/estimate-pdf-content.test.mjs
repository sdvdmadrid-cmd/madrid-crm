import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  deriveServiceTitleFromScope,
  displayServiceLineName,
  parseScopeOfWorkBlocks,
  buildPaymentSchedule,
} from "../../src/lib/estimate-pdf-content.js";

describe("estimate-pdf-content", () => {
  it("derives service title from first scope line", () => {
    const title = deriveServiceTitleFromScope(
      "Landscape renovation\n- Remove old sod\n- Install new turf",
    );
    assert.equal(title, "Landscape renovation");
  });

  it("replaces Base Price with service title", () => {
    const name = displayServiceLineName(
      { id: "base_price", name: "Base Price", qty: 1 },
      { serviceTitle: "Weekly lawn maintenance" },
    );
    assert.equal(name, "Weekly lawn maintenance");
  });

  it("parses bullet scope lines", () => {
    const { bullets, paragraphs } = parseScopeOfWorkBlocks(
      "Overview paragraph\n- First task\n- Second task",
    );
    assert.equal(paragraphs[0], "Overview paragraph");
    assert.deepEqual(bullets, ["First task", "Second task"]);
  });

  it("builds payment schedule from total", () => {
    const schedule = buildPaymentSchedule(1000, { depositPercent: 50 });
    assert.equal(schedule.deposit, 500);
    assert.equal(schedule.finalPayment, 500);
  });
});
