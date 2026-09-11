import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  WIN_ON_SITE_MAX_PHOTOS,
  WIN_ON_SITE_PHASE,
} from "../../src/lib/win-on-site-helpers.js";

const root = process.cwd();

test("phase 5 marks win-on-site phase", () => {
  assert.ok(WIN_ON_SITE_PHASE >= 5);
  assert.ok(WIN_ON_SITE_MAX_PHOTOS >= 8);
});

test("phase 5 wires auto-portfolio + review CTA + progress notify", () => {
  const publishLib = readFileSync(
    path.join(root, "src/lib/job-portfolio-publish.js"),
    "utf8",
  );
  const notifyLib = readFileSync(
    path.join(root, "src/lib/job-progress-notify.js"),
    "utf8",
  );
  const filesRoute = readFileSync(
    path.join(root, "src/app/api/jobs/[id]/files/route.js"),
    "utf8",
  );
  const confirmRoute = readFileSync(
    path.join(root, "src/app/api/jobs/[id]/files/confirm/route.js"),
    "utf8",
  );
  const progressApi = readFileSync(
    path.join(root, "src/app/api/public/jobs/progress/[token]/route.js"),
    "utf8",
  );
  const progressPage = readFileSync(
    path.join(root, "src/app/progress/[token]/page.js"),
    "utf8",
  );
  const progressLink = readFileSync(
    path.join(root, "src/app/api/jobs/[id]/progress-link/route.js"),
    "utf8",
  );
  const photosClient = readFileSync(
    path.join(root, "src/components/jobs/JobPhotosClient.jsx"),
    "utf8",
  );

  assert.match(publishLib, /maybeAutoPublishCompletionPhoto/);
  assert.match(publishLib, /publishJobPhotoToPortfolio/);
  assert.match(notifyLib, /deliverJobProgressNotifications/);
  assert.match(filesRoute, /maybeAutoPublishCompletionPhoto/);
  assert.match(confirmRoute, /maybeAutoPublishCompletionPhoto/);
  assert.match(progressApi, /showCta/);
  assert.match(progressApi, /googleReviewsUrl|googleUrl/);
  assert.match(progressPage, /public-job-review-cta/);
  assert.match(progressLink, /deliverJobProgressNotifications/);
  assert.match(photosClient, /notify:\s*true/);
});
