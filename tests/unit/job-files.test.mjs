import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getJobFileValidationError,
  isJobTimelineMediaType,
  JOB_FILE_MAX_BYTES,
  JOB_VIDEO_MAX_BYTES,
  normalizePhotoStage,
  JOB_PHOTO_STAGES,
} from "../../src/lib/job-files.js";
import {
  createJobProgressToken,
  isValidJobProgressToken,
  verifyJobProgressToken,
} from "../../src/lib/job-progress-access.js";
import { WIN_ON_SITE_MAX_PHOTOS, WIN_ON_SITE_PHASE } from "../../src/lib/win-on-site-helpers.js";

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

describe("job-files media capacity", () => {
  it("accepts photos up to 15MB and videos up to 50MB", () => {
    assert.equal(JOB_FILE_MAX_BYTES, 15 * 1024 * 1024);
    assert.equal(JOB_VIDEO_MAX_BYTES, 50 * 1024 * 1024);

    const photoOk = getJobFileValidationError("photo", {
      size: 14 * 1024 * 1024,
      type: "image/webp",
    });
    assert.equal(photoOk, "");

    const videoOk = getJobFileValidationError("video", {
      size: 40 * 1024 * 1024,
      type: "video/mp4",
    });
    assert.equal(videoOk, "");

    const videoTooBig = getJobFileValidationError("video", {
      size: 51 * 1024 * 1024,
      type: "video/mp4",
    });
    assert.match(videoTooBig, /50MB/);
  });

  it("marks photo and video as timeline media", () => {
    assert.equal(isJobTimelineMediaType("photo"), true);
    assert.equal(isJobTimelineMediaType("video"), true);
    assert.equal(isJobTimelineMediaType("document"), false);
  });
});

describe("job progress tokens", () => {
  it("creates and verifies progress tokens", () => {
    process.env.SESSION_SECRET =
      process.env.SESSION_SECRET || "phase4-test-session-secret-32chars!!";
    const jobId = "11111111-1111-4111-8111-111111111111";
    const token = createJobProgressToken(jobId);
    assert.equal(isValidJobProgressToken(token), true);
    const verified = verifyJobProgressToken(token);
    assert.equal(verified.ok, true);
    assert.equal(verified.jobId, jobId);
  });

  it("rejects invalid tokens", () => {
    process.env.SESSION_SECRET =
      process.env.SESSION_SECRET || "phase4-test-session-secret-32chars!!";
    const verified = verifyJobProgressToken("not-a-real-token");
    assert.equal(verified.ok, false);
  });
});

describe("win on site phase 4 capacity", () => {
  it("raises lead photo capacity and marks phase 4", () => {
    assert.equal(WIN_ON_SITE_PHASE, 4);
    assert.ok(WIN_ON_SITE_MAX_PHOTOS >= 8);
  });
});
