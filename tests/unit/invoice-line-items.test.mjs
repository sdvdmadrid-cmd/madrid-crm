import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeInvoiceLineItemTotal,
  hasDisplayableInvoiceLineItems,
  normalizeInvoiceLineItemsForSave,
  sumInvoiceLineItemsTotals,
} from "../../src/lib/invoice-line-items.js";

describe("invoice-line-items", () => {
  it("computes qty × unit price", () => {
    assert.equal(
      computeInvoiceLineItemTotal({ quantity: 2, unitPrice: 150 }),
      300,
    );
  });

  it("drops empty rows on save", () => {
    assert.deepEqual(
      normalizeInvoiceLineItemsForSave([
        { description: "Labor", quantity: 1, unitPrice: 200 },
        { description: "", quantity: 1, unitPrice: 0 },
      ]).map((row) => row.description),
      ["Labor"],
    );
  });

  it("hides zero-only placeholder rows from display", () => {
    assert.equal(hasDisplayableInvoiceLineItems([]), false);
    assert.equal(
      hasDisplayableInvoiceLineItems([{ description: "", amount: "0" }]),
      false,
    );
    assert.equal(
      hasDisplayableInvoiceLineItems([{ label: "Labor", amount: "120" }]),
      true,
    );
  });

  it("sums normalized line items", () => {
    assert.equal(
      sumInvoiceLineItemsTotals([
        { description: "A", quantity: 2, unitPrice: 50 },
        { description: "B", quantity: 1, unitPrice: 25 },
      ]),
      125,
    );
  });

  it("maps legacy label/amount rows", () => {
    const rows = normalizeInvoiceLineItemsForSave([
      { label: "Materials", amount: "75" },
    ]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].description, "Materials");
    assert.equal(computeInvoiceLineItemTotal(rows[0]), 75);
  });
});
