import assert from "node:assert/strict";
import test from "node:test";

test("getListPaginationParams defaults to page 1 limit 50 when no query params", async () => {
  const { getListPaginationParams } = await import("../../src/lib/tenant-list-pagination.js");
  const params = new URLSearchParams();
  const result = getListPaginationParams(params);

  assert.equal(result.paginate, true);
  assert.equal(result.page, 1);
  assert.equal(result.limit, 50);
  assert.equal(result.from, 0);
  assert.equal(result.to, 49);
});

test("getListPaginationParams honors explicit limit", async () => {
  const { getListPaginationParams } = await import("../../src/lib/tenant-list-pagination.js");
  const params = new URLSearchParams("limit=25&page=2");
  const result = getListPaginationParams(params);

  assert.equal(result.paginate, true);
  assert.equal(result.page, 2);
  assert.equal(result.limit, 25);
  assert.equal(result.from, 25);
  assert.equal(result.to, 49);
});
