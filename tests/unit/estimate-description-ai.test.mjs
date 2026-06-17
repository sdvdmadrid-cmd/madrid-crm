import test from "node:test";
import assert from "node:assert/strict";
import {
  isEstimateDescriptionIncomplete,
  ESTIMATE_DESCRIPTION_CONTINUE_PROMPT,
} from "../../src/lib/estimate-description-validation.js";

test("isEstimateDescriptionIncomplete flags empty text as incomplete", () => {
  assert.equal(isEstimateDescriptionIncomplete("", null), true);
});

test("isEstimateDescriptionIncomplete flags token-limit truncation", () => {
  assert.equal(
    isEstimateDescriptionIncomplete("Work includes grading.", "length"),
    true,
  );
});

test("isEstimateDescriptionIncomplete flags mid-sentence French drain example", () => {
  assert.equal(
    isEstimateDescriptionIncomplete(
      "We will install drainage pipe and connect it as the French drain system is",
      "stop",
    ),
    true,
  );
});

test("isEstimateDescriptionIncomplete accepts complete sentences", () => {
  assert.equal(
    isEstimateDescriptionIncomplete(
      "We will install a French drain system along the rear property line, including excavation, gravel bedding, perforated pipe, and final grading.",
      "stop",
    ),
    false,
  );
});

test("isEstimateDescriptionIncomplete flags trailing commas", () => {
  assert.equal(
    isEstimateDescriptionIncomplete("Scope includes sod installation,", "stop"),
    true,
  );
});

test("continuation prompt instructs the model not to repeat prior text", () => {
  assert.match(ESTIMATE_DESCRIPTION_CONTINUE_PROMPT, /Do not repeat/i);
});
