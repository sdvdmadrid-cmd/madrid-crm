import test from "node:test";
import assert from "node:assert/strict";
import { generateInvoiceWorkPerformed } from "../../src/lib/invoice-work-performed.js";
import { generateInvoiceAssistant } from "../../src/lib/document-ai.js";

const WEEKLY_MOWING_INVOICE = {
  invoiceTitle: "Weekly lawn service",
  clientName: "Jane Client",
  invoiceNumber: "INV-1001",
  amount: "85.00",
  dueDate: "2026-07-15",
  notes: "",
  lineItems: [
    {
      id: "line-1",
      description: "Weekly lawn mowing",
      details:
        "Mowing, edging, and clippings removal for front and back yard.",
      quantity: 1,
      unitPrice: 85,
      amount: "85.00",
    },
  ],
};

test("weekly mowing invoice never mentions snow removal or de-icing", () => {
  const { notes } = generateInvoiceWorkPerformed(WEEKLY_MOWING_INVOICE);

  assert.match(notes, /weekly lawn mowing/i);
  assert.doesNotMatch(notes, /snow removal/i);
  assert.doesNotMatch(notes, /de-icing/i);
  assert.doesNotMatch(notes, /priority dispatch/i);
  assert.doesNotMatch(notes, /landscap/i);
});

test("does not rewrite invoice metadata in work performed output", () => {
  const { notes } = generateInvoiceWorkPerformed(WEEKLY_MOWING_INVOICE);

  assert.doesNotMatch(notes, /due date/i);
  assert.doesNotMatch(notes, /payment is due/i);
  assert.doesNotMatch(notes, /total amount/i);
  assert.doesNotMatch(notes, /\$85\.00/);
  assert.doesNotMatch(notes, /jane client/i);
  assert.doesNotMatch(notes, /inv-1001/i);
});

test("contracted services title does not trigger unrelated snow templates", () => {
  const { notes } = generateInvoiceWorkPerformed({
    invoiceTitle: "contracted services",
    notes: "Invoice prepared for contracted services for Client.",
    lineItems: [
      {
        description: "Weekly lawn mowing",
        details: "Standard weekly maintenance visit.",
        quantity: 1,
        unitPrice: 75,
        amount: "75.00",
      },
    ],
  });

  assert.doesNotMatch(notes, /snow/i);
  assert.doesNotMatch(notes, /de-icing/i);
  assert.match(notes, /weekly lawn mowing/i);
});

test("returns insufficient-data message when line items are missing", () => {
  const { notes, insufficientData } = generateInvoiceWorkPerformed({
    invoiceTitle: "Weekly mowing",
    lineItems: [],
  });

  assert.equal(insufficientData, true);
  assert.match(notes, /more detail is needed/i);
  assert.doesNotMatch(notes, /snow/i);
});

test("summarizes multiple services from actual line items only", () => {
  const { notes } = generateInvoiceWorkPerformed({
    lineItems: [
      {
        description: "Weekly lawn mowing",
        details: "Front and back yard.",
        quantity: 1,
        unitPrice: 60,
      },
      {
        description: "Hedge trimming",
        details: "Privacy hedge along driveway.",
        quantity: 1,
        unitPrice: 40,
      },
    ],
  });

  assert.match(notes, /weekly lawn mowing/i);
  assert.match(notes, /hedge trimming/i);
  assert.doesNotMatch(notes, /snow/i);
});

test("generateInvoiceAssistant only returns work performed notes", () => {
  const result = generateInvoiceAssistant(WEEKLY_MOWING_INVOICE);

  assert.ok(result.notes);
  assert.equal(result.amount, undefined);
  assert.equal(result.dueDate, undefined);
  assert.equal(result.invoiceTitle, undefined);
  assert.equal(result.lineItems, undefined);
});

test("deduplicates repeated sentences", () => {
  const { notes } = generateInvoiceWorkPerformed({
    lineItems: [
      {
        description: "Weekly lawn mowing",
        details: "Weekly lawn mowing for the property.",
        quantity: 1,
        unitPrice: 80,
      },
    ],
  });

  const sentences = notes.split(/(?<=[.!?])\s+/).map((s) => s.trim());
  const normalized = sentences.map((s) => s.toLowerCase());
  assert.equal(normalized.length, new Set(normalized).size);
});

test("output stays within professional word-count bounds when possible", () => {
  const { notes } = generateInvoiceWorkPerformed(WEEKLY_MOWING_INVOICE);
  const words = notes.split(/\s+/).filter(Boolean);

  assert.ok(words.length <= 120);
  assert.ok(words.length >= 20);
});
