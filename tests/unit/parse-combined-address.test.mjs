import test from "node:test";
import assert from "node:assert/strict";
import { parseCombinedAddressString } from "../../src/lib/import-engine/parse-combined-address.js";
import { mapRecordToClientPayload } from "../../src/lib/import-engine/client-import-validate.js";

test("parseCombinedAddressString splits Jobber-style full address", () => {
  const parsed = parseCombinedAddressString(
    "369 Boulder Drive, Glendale Heights, Illinois",
  );
  assert.equal(parsed.street, "369 Boulder Drive");
  assert.equal(parsed.city, "Glendale Heights");
  assert.equal(parsed.state, "Illinois");
});

test("mapRecordToClientPayload parses combined Address column", () => {
  const payload = mapRecordToClientPayload(
    {
      Name: "Melina",
      Address: "597 Glen Ellyn Road, Glendale Heights, Illinois",
      Email: "melina@example.com",
      Phone: "630-555-0100",
    },
    { name: "Name", address: "Address", email: "Email", phone: "Phone" },
  );
  assert.equal(payload.address, "597 Glen Ellyn Road");
  assert.equal(payload.city, "Glendale Heights");
  assert.equal(payload.state, "Illinois");
  assert.equal(payload.phone, "630-555-0100");
});
