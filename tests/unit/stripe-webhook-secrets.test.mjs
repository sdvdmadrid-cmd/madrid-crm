import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  collectStripeWebhookSecrets,
  verifyStripeWebhookPayload,
} from "../../src/lib/stripe-webhook-verify.js";

describe("stripe webhook verify", () => {
  it("collects primary and previous webhook secrets", () => {
    const secrets = collectStripeWebhookSecrets({
      STRIPE_WEBHOOK_SECRET: "whsec_primary",
      STRIPE_WEBHOOK_SECRET_PREVIOUS: "whsec_previous",
    });
    assert.deepEqual(secrets, ["whsec_primary", "whsec_previous"]);
  });

  it("tries each configured secret until one verifies", () => {
    const calls = [];
    const stripe = {
      webhooks: {
        constructEvent(body, signature, secret) {
          calls.push(secret);
          if (secret === "whsec_previous") {
            return { id: "evt_123", type: "account.updated" };
          }
          throw new Error("Invalid signature");
        },
      },
    };

    const event = verifyStripeWebhookPayload(stripe, "{}", "sig_test", [
      "whsec_primary",
      "whsec_previous",
    ]);
    assert.equal(event?.id, "evt_123");
    assert.deepEqual(calls, ["whsec_primary", "whsec_previous"]);
  });
});
