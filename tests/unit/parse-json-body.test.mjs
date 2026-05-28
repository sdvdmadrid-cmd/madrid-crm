import test from "node:test";
import assert from "node:assert/strict";

import { parseJsonBody } from "../../src/lib/parse-json-body.js";

// Pin the contract for the shared JSON body parser used by 5 routes:
//   /api/estimates POST + /api/estimates/[id] PATCH
//   /api/estimate-builder POST + /api/estimate-builder/[id] PATCH
//   /api/estimate-builder/[id]/send POST
// Previously each did a bare `await request.json()` which threw on
// malformed JSON (-> 500) and returned `null` for a literal `null`
// body, where downstream `body.field` crashed with an opaque TypeError
// (-> 500). The helper turns both edge cases into a clean 400.

function makeRequest(body, { contentType = "application/json" } = {}) {
  return new Request("http://localhost/test", {
    method: "POST",
    headers: { "Content-Type": contentType },
    body,
  });
}

test("parseJsonBody returns body for a plain object", async () => {
  const result = await parseJsonBody(
    makeRequest(JSON.stringify({ name: "Alice", count: 3 })),
  );
  assert.equal(result.ok, true);
  assert.deepEqual(result.body, { name: "Alice", count: 3 });
});

test("parseJsonBody returns 400 for malformed JSON", async () => {
  const result = await parseJsonBody(makeRequest("{ not valid json"));
  assert.equal(result.ok, false);
  assert.equal(result.response.status, 400);
  const text = await result.response.text();
  const json = JSON.parse(text);
  assert.equal(json.success, false);
  assert.equal(json.error, "Invalid JSON body");
});

test("parseJsonBody returns 400 for literal null body", async () => {
  const result = await parseJsonBody(makeRequest("null"));
  assert.equal(result.ok, false);
  assert.equal(result.response.status, 400);
  const json = JSON.parse(await result.response.text());
  assert.equal(json.error, "Request body must be a JSON object");
});

test("parseJsonBody returns 400 for top-level array body", async () => {
  // Every estimate / invoice route expects an object body. Array
  // bodies would silently bypass field-by-field destructuring (e.g.
  // body.clientName === undefined) and produce subtle failures.
  const result = await parseJsonBody(makeRequest("[1,2,3]"));
  assert.equal(result.ok, false);
  assert.equal(result.response.status, 400);
});

test("parseJsonBody returns 400 for top-level primitive body", async () => {
  for (const raw of ['"just a string"', "42", "true"]) {
    const result = await parseJsonBody(makeRequest(raw));
    assert.equal(result.ok, false, `primitive ${raw} should fail`);
    assert.equal(result.response.status, 400);
  }
});

test("parseJsonBody returns 400 for empty body", async () => {
  const result = await parseJsonBody(makeRequest(""));
  assert.equal(result.ok, false);
  assert.equal(result.response.status, 400);
});

test("parseJsonBody preserves empty object as a valid body", async () => {
  // {} is a legitimate request body; some routes treat all fields
  // as optional. The helper must not reject it.
  const result = await parseJsonBody(makeRequest("{}"));
  assert.equal(result.ok, true);
  assert.deepEqual(result.body, {});
});
