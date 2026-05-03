import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest";

// ── Stripe Webhook Handler (async, no timeout risk) ─────────────────────────
const handleStripeWebhookAsync = inngest.createFunction(
  {
    id: "stripe-webhook-handler",
    name: "Process Stripe Webhook",
    retries: 5,
    idempotency: "event.data.stripeEventId",
    triggers: [{ event: "stripe/webhook.received" }],
  },
  async ({ event, step }) => {
    const { stripeEventId, eventType, eventData } = event.data;

    // Step 1: Update payment/invoice status in DB
    await step.run("update-payment-status", async () => {
      const { updatePaymentFromStripeEvent } = await import(
        "@/lib/stripe-payments"
      );
      await updatePaymentFromStripeEvent(stripeEventId, eventType, eventData);
    });

    // Step 2: Send notification to tenant owner (if applicable)
    await step.run("notify-tenant", async () => {
      if (
        eventType === "checkout.session.completed" ||
        eventType === "payment_intent.succeeded"
      ) {
        const { createNotificationForPayment } = await import(
          "@/lib/stripe-payments"
        );
        await createNotificationForPayment(eventData);
      }
    });

    return { processed: true, stripeEventId, eventType };
  }
);

// ── Website Lead Handler ─────────────────────────────────────────────────────
const handleWebsiteLeadAsync = inngest.createFunction(
  {
    id: "website-lead-handler",
    name: "Process Website Lead",
    retries: 3,
    triggers: [{ event: "website/lead.received" }],
  },
  async ({ event, step }) => {
    const { contractorEmail, leadData } = event.data;

    await step.run("send-lead-notification", async () => {
      const { sendEmail } = await import("@/lib/email");
      await sendEmail({
        to: contractorEmail,
        subject: `New lead: ${leadData.name}`,
        html: `
          <h2>You have a new lead!</h2>
          <p><strong>Name:</strong> ${leadData.name}</p>
          <p><strong>Email:</strong> ${leadData.email}</p>
          <p><strong>Phone:</strong> ${leadData.phone || "N/A"}</p>
          <p><strong>Message:</strong> ${leadData.message || "N/A"}</p>
        `,
      });
    });

    return { processed: true, leadId: event.data.leadId };
  }
);

// ── Bill Autopay Recurring Handler ─────────────────────────────────────────
const handleRecurringBill = inngest.createFunction(
  {
    id: "recurring-bill-handler",
    name: "Create Next Recurring Bill",
    retries: 3,
    triggers: [{ event: "bill/recurring.due" }],
  },
  async ({ event, step }) => {
    const { billId, tenantId } = event.data;

    await step.run("create-next-bill", async () => {
      const { maybeCreateNextRecurringBill } = await import("@/lib/bill-payments");
      await maybeCreateNextRecurringBill(billId, tenantId);
    });

    return { processed: true, billId };
  }
);

// ── Email Notification Handler ──────────────────────────────────────────────
const handleEmailNotification = inngest.createFunction(
  {
    id: "email-notification-handler",
    name: "Send Email Notification",
    retries: 3,
    throttle: {
      key: "event.data.tenantId",
      count: 50,
      period: "1m",
    },
    triggers: [{ event: "email/notification.needed" }],
  },
  async ({ event, step }) => {
    const { to, subject, html } = event.data;

    await step.run("send-email", async () => {
      const { sendEmail } = await import("@/lib/email");
      await sendEmail({ to, subject, html });
    });

    return { processed: true, tenantId: event.data.tenantId };
  }
);

// ── Inngest Next.js Route Handler ───────────────────────────────────────────
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    handleStripeWebhookAsync,
    handleWebsiteLeadAsync,
    handleRecurringBill,
    handleEmailNotification,
  ],
});
