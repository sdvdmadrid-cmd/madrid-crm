import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  appendFieldBasePoweredByText,
  buildFieldBasePoweredByHtml,
  getFieldBasePoweredByLabel,
  FIELDBASE_WEBSITE_URL,
} from "../../src/lib/fieldbase-document-branding.js";

describe("fieldbase-document-branding", () => {
  it("uses consistent powered-by label", () => {
    assert.equal(getFieldBasePoweredByLabel(), "Powered by FieldBase");
  });

  it("renders HTML footer with link", () => {
    const html = buildFieldBasePoweredByHtml();
    assert.match(html, /Powered by FieldBase/);
    assert.match(html, new RegExp(FIELDBASE_WEBSITE_URL.replace(/\./g, "\\.")));
  });

  it("appends plain-text branding to email body", () => {
    const text = appendFieldBasePoweredByText("Thanks for your business.");
    assert.match(text, /Thanks for your business/);
    assert.match(text, /Powered by FieldBase/);
    assert.match(text, /fieldbaseapp\.net/);
  });
});
