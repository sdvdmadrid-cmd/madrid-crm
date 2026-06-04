import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildInvoicePartyDbFields,
  formatClientBillingAddress,
  formatClientServiceAddress,
  resolveInvoicePartyDisplay,
} from "../../src/lib/invoice-party.js";

describe("invoice-party", () => {
  it("formats service and billing addresses", () => {
    const client = {
      address: "100 Oak St",
      city: "Austin",
      state: "TX",
      zip: "78701",
      billing_address: "PO Box 9",
      billing_city: "Round Rock",
      billing_state: "TX",
      billing_zip: "78664",
      billing_same_as_service: false,
    };
    assert.equal(
      formatClientServiceAddress(client),
      "100 Oak St, Austin, TX, 78701",
    );
    assert.equal(
      formatClientBillingAddress(client),
      "PO Box 9, Round Rock, TX, 78664",
    );
  });

  it("uses service address when billing matches service", () => {
    const client = {
      address: "200 Main St",
      city: "Dallas",
      state: "TX",
      zip: "75201",
      billing_same_as_service: true,
    };
    assert.equal(
      formatClientBillingAddress(client),
      formatClientServiceAddress(client),
    );
  });

  it("builds DB snapshot fields from client", () => {
    const fields = buildInvoicePartyDbFields(
      {
        phone: "+15551234567",
        email: "client@example.com",
        address: "1 Job Ln",
        city: "Plano",
        state: "TX",
        zip: "75024",
      },
      {},
    );
    assert.equal(fields.client_phone, "+15551234567");
    assert.equal(fields.client_email, "client@example.com");
    assert.match(fields.property_address, /1 Job Ln/);
  });

  it("resolves display party from invoice doc", () => {
    const party = resolveInvoicePartyDisplay({
      clientName: "Acme",
      clientPhone: "555-0100",
      clientAddress: "PO Box 1",
      propertyAddress: "9 Work Rd",
    });
    assert.equal(party.hasCustomerAddress, true);
    assert.equal(party.hasPropertyAddress, true);
    assert.equal(party.clientPhone, "555-0100");
  });
});
