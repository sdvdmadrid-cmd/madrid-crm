import test from "node:test";
import assert from "node:assert/strict";
import {
  autofillGuardProps,
  autofillReadonlyUntilFocusProps,
} from "../../src/lib/form-autofill-guard.js";

test("autofillGuardProps uses non-standard names and disables autocomplete", () => {
  const street = autofillGuardProps("street");
  assert.equal(street.autoComplete, "off");
  assert.equal(street.name, "fb-service-street-line");
  assert.equal(street["data-lpignore"], "true");
});

test("autofillReadonlyUntilFocusProps starts readonly", () => {
  const props = autofillReadonlyUntilFocusProps();
  assert.equal(props.readOnly, true);
  assert.equal(typeof props.onFocus, "function");
});
