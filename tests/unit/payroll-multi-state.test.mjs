import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { STATE_WITHHOLDING_FLAT_RATES_2026, allStateFlatRateMap } from "../../src/lib/payroll-all-states-tax-data.js";
import { defaultStateFlatRate } from "../../src/lib/payroll-state-tax-tables.js";
import { defaultFederalTables } from "../../src/lib/payroll-tax-tables.js";

describe("multi-state tax engine", () => {
  it("includes all 50 states in flat rate map", () => {
    const states = Object.keys(allStateFlatRateMap());
    assert.equal(states.length, 50);
    assert.ok(states.includes("TX"));
    assert.ok(states.includes("CA"));
    assert.equal(STATE_WITHHOLDING_FLAT_RATES_2026.TX, 0);
    assert.equal(STATE_WITHHOLDING_FLAT_RATES_2026.CA, 0);
  });

  it("defaultFederalTables merges all state rates and version label", () => {
    const tables = defaultFederalTables();
    assert.equal(tables.versionLabel, "2026-v2");
    assert.equal(Object.keys(tables.stateFlatRates).length, 50);
    assert.ok(tables.stateWithholdingBrackets.CO);
    assert.ok(tables.localTaxRates.NY);
  });

  it("defaultStateFlatRate returns accurate TX and IL rates", () => {
    assert.equal(defaultStateFlatRate("TX"), 0);
    assert.equal(defaultStateFlatRate("IL"), 0.0495);
  });
});
