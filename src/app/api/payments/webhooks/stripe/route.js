import { after } from "next/server";
import Stripe from "stripe";
import { INNGEST_EVENTS, isInngestEnabled, sendInngestEvent } from "@/lib/inngest";
import { processStripeWebhookEvent } from "@/lib/stripe-webhook-processing";
import {
  getStripeSecretKey,
  getStripeWebhookSecrets,
  verifyStripeWebhookPayload,
} from "@/lib/stripe-payments";

export const runtime = "nodejs";
export const maxDuration = 30;

const HANDLED_EVENT_TYPES = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
  "payment_intent.succeeded",
  "payment_intent.processing",
  "payment_intent.payment_failed",
  "payment_intent.canceled",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_succeeded",
  "invoice.payment_failed",
  "invoice.paid",
  "account.updated",
]);

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function queueStripeWebhookProcessing(event) {
  if (isInngestEnabled()) {
    const queued = await sendInngestEvent(INNGEST_EVENTS.STRIPE_WEBHOOK, {
      stripeEventId: event.id,
      event,
    });
    if (queued) {
      return { mode: "inngest" };
    }
  }

  after(async () => {
    try {
      await processStripeWebhookEvent(event);
    } catch (error) {
      console.error(
        "[api/payments/webhooks/stripe][after] processing failed",
        event?.id || "unknown",
        event?.type || "unknown",
        error,
      );
    }
  });

  return { mode: "after" };
}

export async function POST(request) {
  try {
    const secret = getStripeSecretKey();
    const webhookSecrets = getStripeWebhookSecrets();
    if (!secret || webhookSecrets.length === 0) {
      return jsonResponse(
        {
          success: false,
          error: "Missing Stripe webhook configuration",
        },
        500,
      );
    }

    const stripe = new Stripe(secret);
    const signature = request.headers.get("stripe-signature") || "";
    if (!signature) {
      return jsonResponse(
        {
          success: false,
          error: "Missing stripe-signature header",
        },
        400,
      );
    }

    const body = await request.text();
    const event = verifyStripeWebhookPayload(stripe, body, signature);
    if (!event) {
      console.error(
        "[api/payments/webhooks/stripe][POST] Invalid Stripe webhook signature",
        { secretCount: webhookSecrets.length },
      );
      return jsonResponse(
        {
          success: false,
          error: "Invalid Stripe webhook signature",
        },
        400,
      );
    }

    if (!HANDLED_EVENT_TYPES.has(event.type)) {
      return jsonResponse({ success: true, ignored: true, eventType: event.type });
    }

    const delivery = await queueStripeWebhookProcessing(event);
    return jsonResponse({
      success: true,
      received: true,
      eventType: event.type,
      eventId: event.id,
      delivery: delivery.mode,
    });
  } catch (error) {
    console.error("[api/payments/webhooks/stripe][POST] error", error);
    return jsonResponse(
      { success: false, error: error.message },
      500,
    );
  }
}
