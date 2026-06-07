import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  partyFieldsFromClient,
  attachFreshPartyToEstimateDbRow,
} from "../../src/lib/client-document-party.js";
import { parseEstimateNotes } from "../../src/lib/estimate-notes.js";

describe("client-document-party", () => {
  it("maps client record into party fields", () => {
    const party = partyFieldsFromClient({
      phone: "+15551234567",
      email: "client@example.com",
      address: "9 Job Site Rd",
      city: "Austin",
      state: "TX",
      zip: "78701",
      billing_address: "PO Box 1",
      billing_city: "Round Rock",
      billing_state: "TX",
      billing_zip: "78664",
      billing_same_as_service: false,
    });
    assert.equal(party.client_phone, "+15551234567");
    assert.equal(party.client_email, "client@example.com");
    assert.match(party.property_address, /9 Job Site Rd/);
    assert.match(party.client_address, /PO Box 1/);
  });

  it("attachFreshPartyToEstimateDbRow merges client into notes JSON", async () => {
    const supabase = {
      from(table) {
        assert.equal(table, "clients");
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          ilike() {
            return this;
          },
          limit: async () => ({
            data: [
              {
                id: "client-uuid-1",
                name: "Acme Co",
                phone: "+15550100",
                email: "acme@example.com",
                address: "100 Oak St",
                city: "Austin",
                state: "TX",
                zip: "78701",
                billing_same_as_service: true,
              },
            ],
            error: null,
          }),
        };
      },
    };

    const row = await attachFreshPartyToEstimateDbRow(supabase, "tenant-1", {
      client_name: "Acme Co",
      notes: JSON.stringify({ noteText: "Scope work" }),
    });

    assert.equal(row.client_id, null);
    const parsed = parseEstimateNotes(row.notes);
    assert.equal(parsed.clientUuid, "client-uuid-1");
    assert.match(parsed.address, /100 Oak St/);
    assert.equal(parsed.clientEmail, "acme@example.com");
    assert.equal(parsed.clientPhone, "+15550100");
  });
});
