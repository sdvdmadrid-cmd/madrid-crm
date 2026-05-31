import test from "node:test";
import assert from "node:assert/strict";
import {
  PUBLIC_SITE_NAV_LINKS,
  PUBLIC_SITE_SECTIONS,
  LEAD_FORM_SECTION_IDS,
  getRequiredPublicSiteSectionIds,
  isScrollableContainer,
  isSameDocumentHashLink,
  parseInPageHash,
} from "../../src/lib/public-site-navigation.js";

test("parseInPageHash extracts hash from multiple href formats", () => {
  assert.equal(parseInPageHash("#services"), "services");
  assert.equal(parseInPageHash("/sites/acme-landscaping#gallery"), "gallery");
  assert.equal(parseInPageHash(""), "");
  assert.equal(parseInPageHash("/sites/acme/request"), "");
});

test("isSameDocumentHashLink identifies in-page anchors", () => {
  assert.equal(isSameDocumentHashLink("#reviews"), true);
  assert.equal(isSameDocumentHashLink("/sites/foo"), false);
});

test("PUBLIC_SITE_NAV_LINKS map to stable section ids", () => {
  const hashes = PUBLIC_SITE_NAV_LINKS.map((link) => link.hash.replace(/^#/, ""));
  assert.ok(hashes.includes(PUBLIC_SITE_SECTIONS.services));
  assert.ok(hashes.includes(PUBLIC_SITE_SECTIONS.gallery));
  assert.ok(hashes.includes(PUBLIC_SITE_SECTIONS.reviews));
  assert.ok(hashes.includes(PUBLIC_SITE_SECTIONS.about));
  assert.ok(hashes.includes(PUBLIC_SITE_SECTIONS.requestService));
});

test("lead form sections include request-service and contact", () => {
  assert.equal(LEAD_FORM_SECTION_IDS.has("request-service"), true);
  assert.equal(LEAD_FORM_SECTION_IDS.has("contact"), true);
});

test("required section ids cover primary nav targets", () => {
  const required = getRequiredPublicSiteSectionIds({ hasAbout: true, hasReviews: true });
  for (const link of PUBLIC_SITE_NAV_LINKS) {
    const id = link.hash.replace(/^#/, "");
    if (id === PUBLIC_SITE_SECTIONS.requestService) {
      assert.ok(required.includes(id));
    } else {
      assert.ok(required.includes(id), `missing required section: ${id}`);
    }
  }
});

test("isScrollableContainer ignores non-overflow and document elements", () => {
  assert.equal(isScrollableContainer(null), false);
  assert.equal(isScrollableContainer({ scrollHeight: 100, clientHeight: 50 }), false);
});

test("section id constants stay stable for published sites", () => {
  assert.equal(PUBLIC_SITE_SECTIONS.services, "services");
  assert.equal(PUBLIC_SITE_SECTIONS.gallery, "gallery");
  assert.equal(PUBLIC_SITE_SECTIONS.reviews, "reviews");
  assert.equal(PUBLIC_SITE_SECTIONS.about, "about");
  assert.equal(PUBLIC_SITE_SECTIONS.requestService, "request-service");
});
