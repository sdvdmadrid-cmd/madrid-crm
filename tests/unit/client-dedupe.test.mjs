import test from "node:test";
import assert from "node:assert/strict";

import { findDuplicateClientGroups } from "../../src/lib/client-dedupe-groups.js";

test("findDuplicateClientGroups merges same phone and same name", () => {
  const rows = [
    {
      id: "1",
      name: "4940 Egandale LLC",
      phone: "7087742564",
      email: "",
      address: "",
      created_at: "2026-01-01",
    },
    {
      id: "2",
      name: "4940 Egandale LLC",
      phone: "7087742564",
      email: "",
      address: "112 Main St",
      created_at: "2026-02-01",
    },
    {
      id: "3",
      name: "Other Client",
      phone: "3125550100",
      email: "a@test.com",
      address: "",
      created_at: "2026-01-01",
    },
  ];

  const { groups } = findDuplicateClientGroups(rows);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].duplicateIds.length, 1);
  assert.equal(groups[0].keeperId, "2");
  assert.deepEqual(groups[0].duplicateIds, ["1"]);
});
