import Stripe from "stripe";
import {
  computeBillStatus,
  createNotification,
  maybeCreateNextRecurringBill,
} from "@/lib/bill-payments";
import {
  getStripeSecretKey,
  getStripeWebhookSecret,
  requireWebhookPaymentResources,
  syncInvoicePaymentSummary,
} from "@/lib/stripe-payments";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { logSupabaseError } from "@/lib/supabase-db";

const PAYMENTS = "payments";
const BILL_PAYMENT_TRANSACTIONS = "bill_payment_transactions";
const BILLS = "bills";
const CONTRACTOR_SUBSCRIPTIONS = "contractor_subscriptions";
const SUBSCRIPTION_INVOICES = "subscription_invoices";

export const runtime = "nodejs";

function getBillPaymentStatusFromEvent(eventType) {
  if (eventType === "payment_intent.succeeded") return "paid";
  if (eventType === "payment_intent.processing") return "processing";
  if (
    eventType === "payment_intent.payment_failed" ||
    eventType === "payment_intent.canceled"
  ) {
    return "failed";
  }
  return "processing";
}

/**
 * Handle Stripe subscription events (customer.subscription.*, invoice.*)
 */
async function handleSubscriptionEvent(event) {
  try {
    if (event.type === "customer.subscription.updated") {
      const subscription = event.data.object;
      const metadata = subscription.metadata || {};
      const tenantId = String(metadata.tenant_id || "");

      if (!tenantId) {
        return null;
      }

      const { error: updateError } = await supabaseAdmin
        .from(CONTRACTOR_SUBSCRIPTIONS)
        .update({
          status: subscription.status,
          current_period_start: subscription.current_period_start
            ? new Date(subscription.current_period_start * 1000).toISOString()
            : null,
          current_period_end: subscription.current_period_end
            ? new Date(subscription.current_period_end * 1000).toISOString()
            : null,
          updated_at: new Date().toISOString(),
        })
        .eq("stripe_subscription_id", subscription.id);

      if (updateError) {
        logSupabaseError(
          "[api/payments/webhooks/stripe][customer.subscription.updated]",
          updateError,
          { subscriptionId: subscription.id, tenantId },
        );
      }
      return null;
    }

    if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object;
      const metadata = subscription.metadata || {};
      const tenantId = String(metadata.tenant_id || "");

      if (!tenantId) {
        return null;
      }

      const { error: updateError } = await supabaseAdmin
        .from(CONTRACTOR_SUBSCRIPTIONS)
        .update({
          status: "cancelled",
          cancelled_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("stripe_subscription_id", subscription.id);

      if (updateError) {
        logSupabaseError(
          "[api/payments/webhooks/stripe][customer.subscription.deleted]",
          updateError,
          { subscriptionId: subscription.id, tenantId },
        );
      }
      return null;
    }

    if (event.type === "invoice.payment_succeeded") {
      const invoice = event.data.object;
      const metadata = invoice.metadata || {};
      const subscriptionId = String(invoice.subscription || "");
      const tenantId = String(metadata.tenant_id || "");

      if (!subscriptionId || !tenantId) {
        return null;
      }

      // Get subscription to find tenant_id if not in metadata
      if (!tenantId) {
        const { data: subscription, error: subError } = await supabaseAdmin
          .from(CONTRACTOR_SUBSCRIPTIONS)
          .select("tenant_id")
          .eq("stripe_subscription_id", subscriptionId)
          .single();

        if (subError || !subscription) {
          return null;
        }
      }

      const paidAtTimestamp = invoice.paid_at
        ? new Date(invoice.paid_at * 1000).toISOString()
        : new Date().toISOString();

      const { error: invoiceInsertError } = await supabaseAdmin
        .from(SUBSCRIPTION_INVOICES)
        .upsert(
          {
            tenant_id: tenantId,
            subscription_id: subscriptionId,
            stripe_invoice_id: invoice.id,
            amount: invoice.amount_paid / 100,
            currency: invoice.currency,
            status: "paid",
            period_start: invoice.period_start
              ? new Date(invoice.period_start * 1000).toISOString()
              : null,
            period_end: invoice.period_end
              ? new Date(invoice.period_end * 1000).toISOString()
              : null,
            paid_at: paidAtTimestamp,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "stripe_invoice_id" },
        );

      if (invoiceInsertError) {
        logSupabaseError(
          "[api/payments/webhooks/stripe][invoice.payment_succeeded]",
          invoiceInsertError,
          { invoiceId: invoice.id, subscriptionId },
        );
      }
      return null;
    }

    if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object;
      const subscriptionId = String(invoice.subscription || "");
      const metadata = invoice.metadata || {};
      const tenantId = String(metadata.tenant_id || "");

      if (!subscriptionId) {
        return null;
      }

      // Get subscription to find tenant_id if not in metadata
      let actualTenantId = tenantId;
      if (!actualTenantId) {
        const { data: subscription, error: subError } = await supabaseAdmin
          .from(CONTRACTOR_SUBSCRIPTIONS)
          .select("tenant_id")
          .eq("stripe_subscription_id", subscriptionId)
          .single();

        if (subError || !subscription) {
          return null;
        }
        actualTenantId = subscription.tenant_id;
      }

      const { error: invoiceInsertError } = await supabaseAdmin
        .from(SUBSCRIPTION_INVOICES)
        .upsert(
          {
            tenant_id: actualTenantId,
            subscription_id: subscriptionId,
            stripe_invoice_id: invoice.id,
            amount: invoice.amount_due / 100,
            currency: invoice.currency,
            status: "failed",
            period_start: invoice.period_start
              ? new Date(invoice.period_start * 1000).toISOString()
              : null,
            period_end: invoice.period_end
              ? new Date(invoice.period_end * 1000).toISOString()
              : null,
            due_at: invoice.due_date
              ? new Date(invoice.due_date * 1000).toISOString()
              : null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "stripe_invoice_id" },
        );

      if (invoiceInsertError) {
        logSupabaseError(
          "[api/payments/webhooks/stripe][invoice.payment_failed]",
          invoiceInsertError,
          { invoiceId: invoice.id, subscriptionId },
        );
      }
      return null;
    }

    return null;
  } catch (error) {
    console.error("[api/payments/webhooks/stripe] subscription event error:", error);
    return null;
  }
}

function getBillPaymentStatusFromEvent(eventType) {
  if (eventType === "payment_intent.succeeded") return "paid";
  if (eventType === "payment_intent.processing") return "processing";
  if (
    eventType === "payment_intent.payment_failed" ||
    eventType === "payment_intent.canceled"
  ) {
    return "failed";
  }
  return "processing";
}

async function handleBillPaymentIntentEvent(intent, eventType) {
  const metadata = intent.metadata || {};
  if (String(metadata.source || "") !== "bill_payment") {
    return null;
  }

  const transactionId = String(metadata.transactionId || "");
  const billId = String(metadata.billId || "");
  const tenantId = String(metadata.tenantDbId || "");
  const userId = String(metadata.userId || "");
  if (!transactionId || !billId || !tenantId) {
    return new Response(
      JSON.stringify({
        success: false,
        error: "Missing Bill Payment metadata",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const [
    { data: transaction, error: transactionError },
    { data: bill, error: billError },
  ] = await Promise.all([
    supabaseAdmin
      .from(BILL_PAYMENT_TRANSACTIONS)
      .select("*")
      .eq("id", transactionId)
      .eq("tenant_id", tenantId)
      .maybeSingle(),
    supabaseAdmin
      .from(BILLS)
      .select("*")
      .eq("id", billId)
      .eq("tenant_id", tenantId)
      .maybeSingle(),
  ]);

  const firstError = transactionError || billError;
  if (firstError) {
    logSupabaseError(
      "[api/payments/webhooks/stripe][POST] bill payment lookup error",
      firstError,
      { transactionId, billId, tenantId, stripePaymentIntentId: intent.id },
    );
    throw new Error(firstError.message);
  }

  if (!transaction || !bill) {
    return new Response(
      JSON.stringify({
        success: false,
        error: "Bill payment transaction not found",
      }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  const nextStatus = getBillPaymentStatusFromEvent(eventType);
  const nowIso = new Date().toISOString();
  const failureReason =
    intent.last_payment_error?.message ||
    intent.cancellation_reason ||
    transaction.failure_reason ||
    "";

  const { error: transactionUpdateError } = await supabaseAdmin
    .from(BILL_PAYMENT_TRANSACTIONS)
    .update({
      stripe_payment_intent_id: intent.id,
      stripe_payment_method_id:
        typeof intent.payment_method === "string"
          ? intent.payment_method
          : transaction.stripe_payment_method_id,
      status: nextStatus,
      processed_at: nextStatus === "paid" ? nowIso : transaction.processed_at,
      failed_at: nextStatus === "failed" ? nowIso : null,
      failure_reason: nextStatus === "failed" ? failureReason : "",
      updated_at: nowIso,
    })
    .eq("id", transaction.id)
    .eq("tenant_id", tenantId);

  if (transactionUpdateError) {
    logSupabaseError(
      "[api/payments/webhooks/stripe][POST] bill transaction update error",
      transactionUpdateError,
      {
        transactionId: transaction.id,
        billId,
        tenantId,
        stripePaymentIntentId: intent.id,
      },
    );
    throw new Error(transactionUpdateError.message);
  }

  const nextBillStatus =
    nextStatus === "paid"
      ? "paid"
      : nextStatus === "processing"
        ? "processing"
        : computeBillStatus({ ...bill, status: "open" });

  const { error: billUpdateError } = await supabaseAdmin
    .from(BILLS)
    .update({
      status: nextBillStatus,
      last_paid_at: nextStatus === "paid" ? nowIso : bill.last_paid_at,
      last_payment_id: transaction.id,
      updated_at: nowIso,
    })
    .eq("id", bill.id)
    .eq("tenant_id", tenantId);

  if (billUpdateError) {
    logSupabaseError(
      "[api/payments/webhooks/stripe][POST] bill update error",
      billUpdateError,
      {
        transactionId: transaction.id,
        billId,
        tenantId,
        stripePaymentIntentId: intent.id,
      },
    );
  }

  await createNotification({
    tenantId,
    userId,
    type:
      nextStatus === "paid"
        ? "bill_payment_success"
        : nextStatus === "failed"
          ? "bill_payment_failed"
          : "bill_payment_processing",
    title:
      nextStatus === "paid"
        ? "Bill payment completed"
        : nextStatus === "failed"
          ? "Bill payment failed"
          : "Bill payment processing",
    message:
      nextStatus === "paid"
        ? `${bill.provider_name} payment completed successfully.`
        : nextStatus === "failed"
          ? `${bill.provider_name} payment failed. ${failureReason}`.trim()
          : `${bill.provider_name} payment is still processing.`,
    metadata: {
      billId: bill.id,
      transactionId: transaction.id,
      stripePaymentIntentId: intent.id,
    },
  });

  if (nextStatus === "paid") {
    await maybeCreateNextRecurringBill({
      context: {
        tenantDbId: tenantId,
        userId: userId || bill.user_id || null,
      },
      bill: {
        ...bill,
        status: "paid",
        last_paid_at: nowIso,
        last_payment_id: transaction.id,
      },
    });
  }

  return new Response(
    JSON.stringify({
      success: true,
      billId: bill.id,
      transactionId: transaction.id,
      paymentStatus: nextStatus,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

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

    // Handle subscription events
    if (
      event.type.startsWith("customer.subscription.") ||
      event.type.startsWith("invoice.")
    ) {
      await handleSubscriptionEvent(event);
      return new Response(
        JSON.stringify({ success: true, eventType: event.type }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    if (event.type.startsWith("payment_intent.")) {
      const billResponse = await handleBillPaymentIntentEvent(
        event.data.object,
        event.type,
      );
      if (billResponse) {
        return billResponse;
      }
      return new Response(
        JSON.stringify({ success: true, ignored: true, eventType: event.type }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    const session = event.data.object;
    const paymentId = String(
      session.metadata?.paymentId || session.client_reference_id || "",
    );
    const tenantId = String(
      session.metadata?.companyId || session.metadata?.tenantId || "",
    );
    const contractorId = String(
      session.metadata?.contractor_id ||
        session.metadata?.contractorId ||
        tenantId ||
        "",
    );
    const invoiceId = String(
      session.metadata?.invoice_id || session.metadata?.invoiceId || "",
    );
    const jobId = String(session.metadata?.jobId || "");
    const clientId = String(session.metadata?.clientId || "");
    const sessionAmount = Number((session.amount_total || 0) / 100);

    if (!paymentId || !tenantId || !contractorId || !invoiceId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing Stripe payment metadata",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const access = await requireWebhookPaymentResources({
      invoiceId,
      tenantId,
      jobId,
      clientId,
    });
    if (access.response) {
      return access.response;
    }

    const { data: payment, error: paymentError } = await supabaseAdmin
      .schema("public")
      .from(PAYMENTS)
      .select("*")
      .eq("id", paymentId)
      .eq("contractor_id", contractorId)
      .eq("invoice_id", invoiceId)
      .maybeSingle();

    if (paymentError) {
      logSupabaseError(
        "[api/payments/webhooks/stripe][POST] payment query error",
        paymentError,
        { paymentId, invoiceId, tenantId, sessionId: session.id },
      );
      throw new Error(paymentError.message);
    }

    if (!payment) {
      return new Response(
        JSON.stringify({ success: false, error: "Payment not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    }

    if (
      payment.stripe_session_id &&
      String(payment.stripe_session_id) !== String(session.id)
    ) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Stripe session mismatch for payment",
        }),
        { status: 409, headers: { "Content-Type": "application/json" } },
      );
    }

    if (
      sessionAmount > 0 &&
      Math.abs(Number(payment.amount || 0) - sessionAmount) > 0.01
    ) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Stripe amount mismatch for payment",
        }),
        { status: 409, headers: { "Content-Type": "application/json" } },
      );
    }

    const nextStatus =
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded"
        ? "paid"
        : event.type === "checkout.session.async_payment_failed"
          ? "failed"
          : "expired";

    if (
      String(payment.status || "").toLowerCase() === nextStatus &&
      String(payment.stripe_session_id || "") === String(session.id)
    ) {
      return new Response(
        JSON.stringify({
          success: true,
          skipped: true,
          reason: "Already processed",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    if (
      nextStatus === "paid" &&
      String(session.payment_status || "").toLowerCase() !== "paid"
    ) {
      return new Response(
        JSON.stringify({
          success: true,
          ignored: true,
          reason: "Session not paid",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    const { error: updateError } = await supabaseAdmin
      .schema("public")
      .from(PAYMENTS)
      .update({
        stripe_session_id: session.id,
        stripe_payment_intent_id:
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : payment.stripe_payment_intent_id,
        contractor_id: contractorId,
        checkout_url: payment.checkout_url || session.url || "",
        status: nextStatus,
        completed_at: nextStatus === "paid" ? new Date().toISOString() : null,
        failed_at:
          nextStatus === "failed" || nextStatus === "expired"
            ? new Date().toISOString()
            : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", payment.id)
      .eq("contractor_id", contractorId);

    if (updateError) {
      logSupabaseError(
        "[api/payments/webhooks/stripe][POST] payment update error",
        updateError,
        { paymentId: payment.id, invoiceId, tenantId, sessionId: session.id },
      );
      throw new Error(updateError.message);
    }

    if (invoiceId && nextStatus === "paid") {
      const { error: invoiceUpdateError } = await supabaseAdmin
        .from("invoices")
        .update({
          status: "Paid",
          stripe_session_id: session.id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", invoiceId)
        .eq("tenant_id", tenantId);

      if (invoiceUpdateError) {
        logSupabaseError(
          "[api/payments/webhooks/stripe][POST] invoice update error",
          invoiceUpdateError,
          { invoiceId, tenantId, sessionId: session.id },
        );
      }
    }

    const summary = await syncInvoicePaymentSummary(access.invoice);

    return new Response(
      JSON.stringify({
        success: true,
        invoiceId: access.invoice.id,
        paymentId: payment.id,
        paymentStatus: nextStatus,
        paidAmount: summary.paidAmount,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
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
