import test from "node:test";
import assert from "node:assert/strict";
import {
  getClientsListMeta,
  normalizeClientsListPayload,
} from "../../src/lib/clients-list-response.js";

test("normalizeClientsListPayload accepts raw arrays", () => {
  assert.deepEqual(normalizeClientsListPayload([{ id: "1" }]), [{ id: "1" }]);
});

test("normalizeClientsListPayload accepts paginated wrapper", () => {
  const payload = { data: [{ id: "a" }], total: 10, page: 2, limit: 5, pages: 2 };
  assert.deepEqual(normalizeClientsListPayload(payload), [{ id: "a" }]);
  assert.deepEqual(getClientsListMeta(payload, 1), {
    total: 10,
    page: 2,
    limit: 5,
    pages: 2,
  });
});

test("normalizeClientsListPayload rejects invalid shapes", () => {
  assert.deepEqual(normalizeClientsListPayload(null), []);
  assert.deepEqual(normalizeClientsListPayload({ total: 3 }), []);
});
