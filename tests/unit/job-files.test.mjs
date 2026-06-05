import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizePhotoStage, JOB_PHOTO_STAGES } from "../../src/lib/job-files.js";

describe("job-files photo metadata", () => {
  it("normalizes valid photo stages", () => {
    assert.equal(normalizePhotoStage("before"), "before");
    assert.equal(normalizePhotoStage("COMPLETION"), "completion");
  });

  it("falls back for invalid stages", () => {
    assert.equal(normalizePhotoStage("invalid"), "progress");
    assert.equal(normalizePhotoStage("", "before"), "before");
  });

  it("exports all job photo stages", () => {
    assert.deepEqual(JOB_PHOTO_STAGES, ["before", "progress", "completion"]);
  });
});
