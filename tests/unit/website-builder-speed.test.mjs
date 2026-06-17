import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getIndustryStockImageUrl, getWebsiteBuilderPack } from "../../src/lib/website-builder-industry.js";
import {
  findHeroSlotsForAiEnhancement,
  isWebsiteStockImageUrl,
  mergeWebsiteCopySection,
  runWithConcurrency,
} from "../../src/lib/website-builder-client-generation.js";
import { buildWebsiteImagePrompt } from "../../src/lib/website-builder-image-generation.js";

describe("website-builder speed helpers", () => {
  it("returns stock image URLs per industry", () => {
    const cleaning = getWebsiteBuilderPack("cleaning");
    const url = getIndustryStockImageUrl(cleaning, 0);
    assert.match(url, /^https:\/\/images\.unsplash\.com\//);
  });

  it("runWithConcurrency limits parallel workers", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const items = [1, 2, 3, 4, 5];

    await runWithConcurrency(items, 2, async (value) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 20));
      inFlight -= 1;
      return value * 2;
    });

    assert.equal(maxInFlight <= 2, true);
  });

  it("mergeWebsiteCopySection merges hero and seo fields", () => {
    const { nextForm, nextSiteMeta } = mergeWebsiteCopySection(
      { headline: "Old", services: [] },
      { seoTitle: "Old SEO" },
      {
        headline: "New headline",
        siteMeta: { seoTitle: "New SEO", seoDescription: "Desc" },
      },
    );
    assert.equal(nextForm.headline, "New headline");
    assert.equal(nextSiteMeta.seoTitle, "New SEO");
    assert.equal(nextSiteMeta.seoDescription, "Desc");
  });

  it("buildWebsiteImagePrompt includes industry guardrails", () => {
    const pack = getWebsiteBuilderPack("cleaning");
    const prompt = buildWebsiteImagePrompt({
      pack,
      companyName: "Acme Clean",
      safePrompt: "sparkling kitchen",
    });
    assert.match(prompt, /cleaning/i);
    assert.match(prompt, /Acme Clean/);
  });

  it("detects stock placeholder hero images", () => {
    assert.equal(
      isWebsiteStockImageUrl(
        "https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=1200",
      ),
      true,
    );
    assert.equal(isWebsiteStockImageUrl("https://cdn.example.com/hero.jpg"), false);
  });

  it("findHeroSlotsForAiEnhancement includes stock and empty slots", () => {
    const slots = findHeroSlotsForAiEnhancement(
      [
        {
          src: "https://images.unsplash.com/photo-123?w=1200",
          prompt: "kitchen clean",
        },
        { src: "https://cdn.example.com/custom.jpg", prompt: "custom" },
        { src: "", prompt: "empty slot" },
      ],
      [],
    );
    assert.equal(slots.length, 2);
    assert.equal(slots[0].index, 0);
    assert.equal(slots[1].index, 2);
  });
});
