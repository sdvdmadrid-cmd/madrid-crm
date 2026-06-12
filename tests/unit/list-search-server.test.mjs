import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyListSearchOr,
  sanitizeListSearchTerm,
} from "../../src/lib/list-search-server.js";

describe("list-search-server", () => {
  it("sanitizes short and unsafe search terms", () => {
    assert.equal(sanitizeListSearchTerm("a"), "");
    assert.equal(sanitizeListSearchTerm("  acme  "), "acme");
    assert.equal(sanitizeListSearchTerm("100%"), "100");
  });

  it("returns query unchanged when search empty", () => {
    const query = { or: () => query };
    assert.equal(applyListSearchOr(query, ["name"], ""), query);
  });
});
