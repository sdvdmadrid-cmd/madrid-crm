import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  WIN_ON_SITE_MAX_PHOTOS,
  WIN_ON_SITE_PHASE,
} from "../../src/lib/win-on-site-helpers.js";

const root = process.cwd();

test("phase 4 raises lead photo capacity", () => {
  assert.ok(WIN_ON_SITE_PHASE >= 4);
  assert.ok(WIN_ON_SITE_MAX_PHOTOS >= 8);
  const form = readFileSync(
    path.join(root, "src/components/site/PremiumLeadForm.jsx"),
    "utf8",
  );
  assert.match(form, /MAX_PHOTOS = 12/);
  assert.match(form, /compressImageToDataUrl/);
});

test("phase 4 wires job progress timeline + video capacity", () => {
  const progressApi = readFileSync(
    path.join(root, "src/app/api/public/jobs/progress/[token]/route.js"),
    "utf8",
  );
  const progressPage = readFileSync(
    path.join(root, "src/app/progress/[token]/page.js"),
    "utf8",
  );
  const photosClient = readFileSync(
    path.join(root, "src/components/jobs/JobPhotosClient.jsx"),
    "utf8",
  );
  const jobFiles = readFileSync(path.join(root, "src/lib/job-files.js"), "utf8");
  const migration = readFileSync(
    path.join(root, "supabase/migrations/20260911230000_job_files_video_type.sql"),
    "utf8",
  );
  const portfolio = readFileSync(
    path.join(
      root,
      "src/app/api/jobs/[id]/files/[fileId]/publish-portfolio/route.js",
    ),
    "utf8",
  );
  const portfolioLib = readFileSync(
    path.join(root, "src/lib/job-portfolio-publish.js"),
    "utf8",
  );

  assert.match(progressApi, /job-progress-public|verifyJobProgressToken/);
  assert.match(progressPage, /public-job-progress/);
  assert.match(photosClient, /progress-link/);
  assert.match(photosClient, /signed-upload/);
  assert.match(photosClient, /publish-portfolio/);
  assert.match(jobFiles, /video\/mp4/);
  assert.match(jobFiles, /JOB_VIDEO_MAX_BYTES = 50/);
  assert.match(migration, /'video'/);
  assert.match(portfolio, /publishJobPhotoToPortfolio/);
  assert.match(portfolioLib, /galleryPhotos/);
});
