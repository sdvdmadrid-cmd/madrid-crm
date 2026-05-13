import Stripe from "stripe";
import { INNGEST_EVENTS, isInngestEnabled, sendInngestEvent } from "@/lib/inngest";
import { processStripeWebhookEvent } from "@/lib/stripe-webhook-processing";
import {
  getStripeSecretKey,
  getStripeWebhookSecret,
} from "@/lib/stripe-payments";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const secret = getStripeSecretKey();
    const webhookSecret = getStripeWebhookSecret();
    if (!secret || !webhookSecret) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing Stripe webhook configuration",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    const stripe = new Stripe(secret);
    const signature = request.headers.get("stripe-signature") || "";
    if (!signature) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing stripe-signature header",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const body = await request.text();
    let event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch {
      console.error(
        "[api/payments/webhooks/stripe][POST] Invalid Stripe webhook signature",
      );
      return new Response(
        JSON.stringify({
          success: false,
          error: "Invalid Stripe webhook signature",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    if (
      ![
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
      ].includes(event.type)
    ) {
      return new Response(
        JSON.stringify({ success: true, ignored: true, eventType: event.type }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    if (isInngestEnabled()) {
      const queued = await sendInngestEvent(INNGEST_EVENTS.STRIPE_WEBHOOK, {
        stripeEventId: event.id,
        event,
      });
      if (queued) {
        return new Response(
          JSON.stringify({ success: true, queued: true, eventType: event.type }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
    }

    return await processStripeWebhookEvent(event);
  } catch (error) {
    console.error("[api/payments/webhooks/stripe][POST] error", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
