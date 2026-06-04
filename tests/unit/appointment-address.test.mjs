import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  looksLikeInvalidAddressText,
  isVerifiedAppointmentAddress,
  validateAppointmentLocationPayload,
  buildLocationFromAddressParts,
} from "../../src/lib/appointment-address.js";

describe("appointment-address", () => {
  it("flags junk free-text addresses", () => {
    assert.equal(looksLikeInvalidAddressText("asdfasdfasdf"), true);
    assert.equal(looksLikeInvalidAddressText("123 Fake Fake Fake"), true);
    assert.equal(looksLikeInvalidAddressText("123 Main St, Bartlett, IL"), false);
  });

  it("requires verified place selection when address fields present", () => {
    assert.equal(
      isVerifiedAppointmentAddress({
        street: "123 Main St",
        city: "Bartlett",
        state: "IL",
        zip: "60103",
        placeId: "ChIJx",
        latitude: 41.99,
        longitude: -88.18,
        verified: true,
        formattedAddress: "123 Main St, Bartlett, IL 60103, USA",
      }),
      true,
    );
    assert.equal(
      isVerifiedAppointmentAddress({
        street: "123 Main St",
        city: "Bartlett",
        state: "IL",
        verified: false,
      }),
      false,
    );
  });

  it("validates API payload", () => {
    assert.equal(
      validateAppointmentLocationPayload({
        location: "asdfasdf",
      }),
      "Enter a valid street address from the suggestions.",
    );
    assert.equal(
      validateAppointmentLocationPayload({
        location: "123 Main St, Bartlett, IL 60103",
        addressPlaceId: "ChIJtest",
        latitude: 41.99,
        longitude: -88.18,
      }),
      "",
    );
  });

  it("builds location string from parts", () => {
    assert.equal(
      buildLocationFromAddressParts({
        street: "123 Main St",
        city: "Bartlett",
        state: "IL",
        zip: "60103",
      }),
      "123 Main St, Bartlett, IL 60103",
    );
  });
});
