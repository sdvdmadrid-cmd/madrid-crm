import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  guardAiToolExecution,
  describeAiToolAction,
} from "../../src/lib/ai-tool-guard-utils.js";

describe("ai-tool-guard", () => {
  it("blocks createInvoice without confirmed flag", () => {
    const result = guardAiToolExecution("createInvoice", { clientName: "Acme", amount: 500 });
    assert.equal(result.requiresConfirmation, true);
    assert.match(result.message, /Confirm/i);
  });

  it("allows createInvoice when confirmed", () => {
    const result = guardAiToolExecution("createInvoice", {
      clientName: "Acme",
      confirmed: true,
    });
    assert.equal(result, null);
  });

  it("does not block createEstimate without send", () => {
    const result = guardAiToolExecution("createEstimate", { clientName: "Acme" });
    assert.equal(result, null);
  });

  it("blocks createEstimate with send without confirm", () => {
    const result = guardAiToolExecution("createEstimate", { clientName: "Acme", send: true });
    assert.equal(result.requiresConfirmation, true);
  });

  it("describes payroll run action", () => {
    const text = describeAiToolAction("runPayrollForPeriod", { scheduleType: "weekly" });
    assert.match(text, /payroll/i);
  });
});
