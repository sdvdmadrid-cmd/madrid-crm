import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getIndustryStockImageUrl, getWebsiteBuilderPack } from "../../src/lib/website-builder-industry.js";
import {
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
});
