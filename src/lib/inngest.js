import "server-only";
import { Inngest } from "inngest";

/**
 * Inngest client for serverless background jobs and event processing
 * Use this for:
 * - Async webhook processing (Stripe, Email)
 * - Bill payment recurring jobs
 * - Email notifications
 * - Data cleanup tasks
 *
 * Documentation: https://www.inngest.com/docs
 */

export const inngest = new Inngest({
  id: "madrid-app",
  eventKey: process.env.INNGEST_EVENT_KEY,
  baseUrl: process.env.INNGEST_BASE_URL,
});

// ── Event name constants ────────────────────────────────────────────────────
export const INNGEST_EVENTS = {
  STRIPE_WEBHOOK:        "stripe/webhook.received",
  BILL_PAYMENT:          "bill_payment/processed",
  INVOICE_PAYMENT:       "invoice/payment.completed",
  RECURRING_BILL:        "bill/recurring.due",
  EMAIL_NOTIFICATION:    "email/notification.needed",
  WEBSITE_LEAD:          "website/lead.received",
};

/**
 * Send event to Inngest
 * Events are queued and processed by functions defined in /app/api/inngest/[...route].js
 *
 * @param {string} eventName - Event name (e.g., 'stripe/webhook.received')
 * @param {object} data - Event data
 * @returns {Promise<void>}
 */
export async function sendInngestEvent(eventName, data) {
  try {
    await inngest.send({
      name: eventName,
      data,
      ts: Date.now(),
    });
  } catch (error) {
    console.error(
      `[Inngest] Failed to send event ${eventName}:`,
      error
    );
    // Don't throw - let the API respond success even if event queueing fails
    // Events can be retried via Inngest dashboard
  }
}
