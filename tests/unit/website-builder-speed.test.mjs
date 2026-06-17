import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getIndustryStockImageUrl, getWebsiteBuilderPack } from "../../src/lib/website-builder-industry.js";
import { runWithConcurrency } from "../../src/lib/website-builder-client-generation.js";

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
});
