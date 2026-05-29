import test from "node:test";
import assert from "node:assert/strict";

import { mapJobberClientRow } from "../../src/lib/jobber/mappers.js";

test("mapJobberClientRow maps phones emails and address", () => {
  const row = mapJobberClientRow(
    {
      id: "jb-client-1",
      firstName: "Sam",
      lastName: "Rivera",
      companyName: "Rivera HVAC",
      emails: [{ address: "sam@example.com", primary: true }],
      phones: [{ friendly: "(312) 555-0100", primary: true }],
      billingAddress: {
        street1: "100 Main St",
        city: "Chicago",
        province: "IL",
        postalCode: "60601",
      },
      clientProperties: {
        nodes: [
          {
            id: "prop-1",
            name: "Home",
            address: {
              street1: "200 Oak Ave",
              city: "Chicago",
              province: "IL",
              postalCode: "60602",
            },
          },
        ],
      },
    },
    { tenantId: "00000000-0000-0000-0000-000000000001", userId: "u1" },
  );

  assert.equal(row.name, "Sam Rivera");
  assert.equal(row.email, "sam@example.com");
  assert.equal(row.phone, "(312) 555-0100");
  assert.equal(row.company, "Rivera HVAC");
  assert.match(row.address, /200 Oak Ave/);
  assert.equal(row.jobber_id, "jb-client-1");
});
