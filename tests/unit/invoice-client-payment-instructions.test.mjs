import test from "node:test";
import assert from "node:assert/strict";
import {
  buildInvoicePaymentInstructions,
  getClientPaymentSettings,
} from "../../src/lib/invoice-client-payment-instructions.js";

test("buildInvoicePaymentInstructions includes card link and Zelle details", () => {
  const { textLines, htmlBlock } = buildInvoicePaymentInstructions({
    companyProfile: {
      phone: "+15551234567",
      serviceCatalogPreferences: {
        clientPayments: {
          zelleEmail: "pay@contractor.com",
          zellePhone: "+15559876543",
        },
      },
    },
    invoice: { preferredPaymentMethod: "zelle", amount: "100" },
    checkoutUrl: "https://checkout.stripe.com/test-session",
  });

  const blob = textLines.join("\n");
  assert.match(blob, /Credit or debit card/i);
  assert.match(blob, /checkout\.stripe\.com/i);
  assert.match(blob, /Zelle/i);
  assert.match(blob, /pay@contractor\.com/);
  assert.match(htmlBlock, /Pay invoice securely online/i);
  assert.match(htmlBlock, /Zelle/);
});

test("getClientPaymentSettings falls back to company phone for Zelle", () => {
  const settings = getClientPaymentSettings({ phone: "555-111-2222" });
  assert.equal(settings.zellePhone, "555-111-2222");
});
