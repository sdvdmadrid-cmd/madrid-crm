import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  resolveGalleryIndex,
  resolveHeroSlotIndex,
} from "../../src/lib/workspace-agent/website-image-refs.js";
import { detectWorkspaceIntents } from "../../src/lib/workspace-agent/intents.js";

describe("website-image-refs", () => {
  const gallery = [
    { alt: "Kitchen remodel before" },
    { alt: "Kitchen remodel after" },
    { alt: "Backyard patio" },
  ];

  it("resolves second gallery image", () => {
    assert.equal(resolveGalleryIndex("delete the second gallery image", gallery), 1);
  });

  it("resolves gallery image by alt keyword", () => {
    assert.equal(resolveGalleryIndex("remove the image showing the kitchen", gallery), 0);
  });

  it("resolves hero slot from message", () => {
    assert.equal(resolveHeroSlotIndex("replace the hero image", []), 0);
  });
});

describe("website intents", () => {
  it("detects build full site", () => {
    assert.ok(detectWorkspaceIntents("Build my website from scratch").includes("website.build_full"));
  });

  it("detects premium and testimonials", () => {
    const intents = detectWorkspaceIntents("Make it more premium and add testimonials");
    assert.ok(intents.includes("website.premium_look"));
    assert.ok(intents.includes("website.add_testimonials"));
  });

  it("detects gallery image generation", () => {
    assert.ok(
      detectWorkspaceIntents("Generate 6 gallery images for my business").includes(
        "website.generate_gallery_images",
      ),
    );
  });
});
