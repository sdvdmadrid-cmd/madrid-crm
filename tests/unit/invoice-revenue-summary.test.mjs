import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  summarizeInvoiceRevenue,
  summarizeInvoiceRevenueByTenant,
} from "../../src/lib/invoice-revenue-summary.js";

describe("invoice-revenue-summary", () => {
  it("totals paid and unpaid excluding drafts", () => {
    const summary = summarizeInvoiceRevenue([
      { amount: 100, paid_amount: 100, balance_due: 0, status: "Paid" },
      { amount: 200, paid_amount: 50, balance_due: 150, status: "Partial" },
      { amount: 80, paid_amount: 0, balance_due: 80, status: "Unpaid" },
      { amount: 999, paid_amount: 0, balance_due: 999, status: "Draft" },
    ]);

    assert.equal(summary.totalInvoiced, 1379);
    assert.equal(summary.totalPaid, 150);
    assert.equal(summary.totalUnpaid, 230);
    assert.equal(summary.counts.paidCount, 1);
    assert.equal(summary.counts.unpaidCount, 2);
    assert.equal(summary.counts.partialCount, 1);
    assert.equal(summary.counts.draftCount, 1);
  });

  it("groups totals by tenant", () => {
    const rows = summarizeInvoiceRevenueByTenant([
      {
        tenant_id: "t1",
        amount: 100,
        paid_amount: 100,
        balance_due: 0,
        status: "Paid",
      },
      {
        tenant_id: "t2",
        amount: 50,
        paid_amount: 0,
        balance_due: 50,
        status: "Unpaid",
      },
    ]);

    assert.equal(rows.length, 2);
    assert.equal(rows.find((r) => r.tenantId === "t1").totalPaid, 100);
    assert.equal(rows.find((r) => r.tenantId === "t2").totalUnpaid, 50);
  });
});
