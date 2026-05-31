import test from "node:test";
import assert from "node:assert/strict";

import { filterAndRankRecords, scoreRecordSearch } from "../../src/lib/record-search.js";

test("filterAndRankRecords prioritizes name prefix", () => {
  const rows = filterAndRankRecords(
    [
      { id: "1", name: "Chicago Client", email: "a@b.com" },
      { id: "2", name: "Hank Miller", email: "hank@test.com" },
    ],
    "h",
    (row) => [row.name, row.email],
  );
  assert.equal(rows[0].name, "Hank Miller");
});

test("scoreRecordSearch returns zero for irrelevant token", () => {
  assert.equal(
    scoreRecordSearch({ name: "Jane Doe" }, "zzz", (r) => [r.name]),
    0,
  );
});
