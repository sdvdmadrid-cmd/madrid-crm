import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  buildEstimateDraftFromParsed,
  buildHeuristicEstimateDraft,
  normalizeEstimateDraftServices,
} from "../../src/lib/ai-estimate-draft-helpers.js";
import {
  buildWinOnSitePrompt,
  mergeWinOnSiteLeadMetadata,
  normalizeLeadPhotoDataUrls,
  readDraftEstimateIdFromMetadata,
  WIN_ON_SITE_MAX_PHOTOS,
} from "../../src/lib/win-on-site-helpers.js";

const root = process.cwd();

test("normalizeLeadPhotoDataUrls accepts legacy + array and caps at WIN_ON_SITE_MAX_PHOTOS", () => {
  const urls = normalizeLeadPhotoDataUrls({
    photoDataUrl: "data:image/png;base64,AAA",
    photoDataUrls: [
      "data:image/jpeg;base64,BBB",
      "data:image/png;base64,CCC",
      "data:image/png;base64,DDD",
      "data:image/png;base64,EEE",
      "not-an-image",
      ...Array.from({ length: 20 }, (_, i) => `data:image/png;base64,EXTRA${i}`),
    ],
  });
  assert.equal(urls.length, WIN_ON_SITE_MAX_PHOTOS);
  assert.ok(WIN_ON_SITE_MAX_PHOTOS >= 8);
  assert.ok(urls.every((u) => u.startsWith("data:image/")));
  assert.equal(urls[0], "data:image/jpeg;base64,BBB");
});

test("buildWinOnSitePrompt includes service, description, and photo urls", () => {
  const prompt = buildWinOnSitePrompt({
    serviceNeeded: "Concrete patio",
    description: "Need stamped patio 20x20",
    address: "123 Main St",
    budgetRange: "5k-10k",
    timeline: "asap",
    clientName: "Alex",
    photoUrls: ["https://cdn.example/a.jpg", "https://cdn.example/b.jpg"],
  });
  assert.match(prompt, /Concrete patio/);
  assert.match(prompt, /Need stamped patio/);
  assert.match(prompt, /123 Main St/);
  assert.match(prompt, /https:\/\/cdn\.example\/a\.jpg/);
  assert.match(prompt, /Site photos uploaded \(2\)/);
});

test("mergeWinOnSiteLeadMetadata attaches draftEstimateId and winOnSite", () => {
  const merged = mergeWinOnSiteLeadMetadata(
    { budgetRange: "5k", fullAddress: "A" },
    {
      draftEstimateId: "est-1",
      photoUrls: ["https://x/1.jpg"],
      winOnSite: { phase: 1, source: "heuristic", subtotal: 500 },
    },
  );
  assert.equal(merged.draftEstimateId, "est-1");
  assert.equal(merged.budgetRange, "5k");
  assert.deepEqual(merged.photoUrls, ["https://x/1.jpg"]);
  assert.equal(merged.winOnSite.phase, 1);
  assert.equal(readDraftEstimateIdFromMetadata(merged), "est-1");
  assert.equal(readDraftEstimateIdFromMetadata({}), null);
});

test("normalizeEstimateDraftServices computes price from qty * unitPrice", () => {
  const services = normalizeEstimateDraftServices([
    { name: "Forming", qty: 2, unitPrice: 150 },
    { name: "", qty: 1, unitPrice: 10 },
  ]);
  assert.equal(services.length, 2);
  assert.equal(services[0].price, 300);
  assert.equal(services[0].id, "ai_1");
});

test("buildEstimateDraftFromParsed and heuristic draft produce subtotals", () => {
  const parsed = buildEstimateDraftFromParsed({
    title: "Patio",
    services: [{ name: "Pour", qty: 1, unitPrice: 2200 }],
    scopeNotes: "broom finish",
    confidence: 0.8,
  });
  assert.equal(parsed.subtotal, 2200);
  assert.equal(parsed.title, "Patio");

  const heuristic = buildHeuristicEstimateDraft({
    service: "Concrete driveway",
    details: "replace cracked driveway",
    clientName: "Sam",
  });
  assert.ok(heuristic.subtotal > 0);
  assert.equal(heuristic.source, "heuristic");
  assert.ok(heuristic.services.length >= 1);
});

test("from-text route uses shared generateEstimateDraftFromText helper", () => {
  const src = readFileSync(
    path.join(root, "src/app/api/ai/estimate/from-text/route.js"),
    "utf8",
  );
  assert.match(src, /generateEstimateDraftFromText/);
  assert.doesNotMatch(src, /runAiCompletion/);
});

test("contact route creates Win on Site draft in side effects", () => {
  const src = readFileSync(
    path.join(root, "src/app/api/site/[slug]/contact/route.js"),
    "utf8",
  );
  assert.match(src, /createWinOnSiteEstimateForLead/);
  assert.match(src, /normalizeLeadPhotoDataUrls/);
  assert.match(src, /photoDataUrls/);
});

test("lead inbox serializes draftEstimateId and convert reuses draft", () => {
  const inbox = readFileSync(
    path.join(root, "src/app/api/lead-inbox/route.js"),
    "utf8",
  );
  const convert = readFileSync(
    path.join(root, "src/app/api/lead-inbox/convert/route.js"),
    "utf8",
  );
  const page = readFileSync(path.join(root, "src/app/lead-inbox/page.js"), "utf8");
  assert.match(inbox, /draftEstimateId/);
  assert.match(convert, /readDraftEstimateIdFromMetadata/);
  assert.match(convert, /existingDraftId/);
  assert.match(page, /openDraftEstimate/);
  assert.match(page, /Open draft estimate/);
});

test("PremiumLeadForm supports up to 12 photos", () => {
  const src = readFileSync(
    path.join(root, "src/components/site/PremiumLeadForm.jsx"),
    "utf8",
  );
  assert.match(src, /MAX_PHOTOS = 12/);
  assert.match(src, /photoDataUrls/);
  assert.match(src, /multiple/);
  assert.match(src, /compressImageToDataUrl/);
});
