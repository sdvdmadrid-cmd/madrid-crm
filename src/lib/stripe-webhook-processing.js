import { computeBillStatus, createNotification, maybeCreateNextRecurringBill } from "@/lib/bill-payments";
import { updateConnectProfileByAccountId } from "@/lib/stripe-connect-storage";
import { requireWebhookPaymentResources, syncInvoicePaymentSummary } from "@/lib/stripe-payments";
import { syncUserSubscriptionMetadata } from "@/lib/subscription-access";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { logSupabaseError } from "@/lib/supabase-db";

const PAYMENTS = "payments";
const BILL_PAYMENT_TRANSACTIONS = "bill_payment_transactions";
const BILLS = "bills";
const CONTRACTOR_SUBSCRIPTIONS = "contractor_subscriptions";
const SUBSCRIPTION_INVOICES = "subscription_invoices";
const STRIPE_WEBHOOK_EVENTS = "stripe_webhook_events";
const COMPANY_PROFILES = "company_profiles";

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
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

async function claimStripeWebhookEvent(event) {
  const eventId = String(event?.id || "").trim();
  if (!eventId) {
    return { claimed: true, duplicate: false };
  }

  const { data: existing, error: readError } = await supabaseAdmin
    .from(STRIPE_WEBHOOK_EVENTS)
    .select("id")
    .eq("id", eventId)
    .maybeSingle();

  if (readError) {
    const missingTable =
      readError.code === "42P01" ||
      String(readError.message || "").includes("stripe_webhook_events");
    if (missingTable) {
      return { claimed: true, duplicate: false, tableMissing: true };
    }
    throw new Error(readError.message);
  }

  if (existing?.id) {
    return { claimed: false, duplicate: true };
  }

  const { error: insertError } = await supabaseAdmin
    .from(STRIPE_WEBHOOK_EVENTS)
    .insert({
      id: eventId,
      event_type: String(event?.type || ""),
      metadata: { livemode: Boolean(event?.livemode) },
    });

  if (insertError) {
    if (insertError.code === "23505") {
      return { claimed: false, duplicate: true };
    }
    const missingTable =
      insertError.code === "42P01" ||
      String(insertError.message || "").includes("stripe_webhook_events");
    if (missingTable) {
      return { claimed: true, duplicate: false, tableMissing: true };
    }
    throw new Error(insertError.message);
  }

  return { claimed: true, duplicate: false };
}

async function handleConnectAccountUpdated(account) {
  const accountId = String(account?.id || "").trim();
  const tenantId = String(account?.metadata?.tenant_id || "").trim();
  if (!accountId) {
    return null;
  }

  const chargesEnabled = Boolean(account?.charges_enabled);
  const payoutsEnabled = Boolean(account?.payouts_enabled);
  const onboardedAt =
    chargesEnabled && payoutsEnabled ? new Date().toISOString() : null;

  try {
    await updateConnectProfileByAccountId(accountId, tenantId, {
      chargesEnabled,
      payoutsEnabled,
      onboardedAt,
    });
  } catch (error) {
    logSupabaseError(
      "[stripe-webhook-processing][account.updated]",
      error,
      { accountId, tenantId },
    );
  }
  return null;
}

async function handleSubscriptionEvent(event) {
  try {
    if (
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.created"
    ) {
      const subscription = event.data.object;
      const metadata = subscription.metadata || {};
      const tenantId = String(metadata.tenant_id || "");
      const userId = String(metadata.user_id || "");
      const planId = String(metadata.plan_id || "");
      const status = String(subscription.status || "").toLowerCase();

      if (tenantId) {
        const row = {
          tenant_id: tenantId,
          plan_id: planId || null,
          stripe_subscription_id: subscription.id,
          stripe_customer_id: String(subscription.customer || ""),
          status,
          current_period_start: subscription.current_period_start
            ? new Date(subscription.current_period_start * 1000).toISOString()
            : null,
          current_period_end: subscription.current_period_end
            ? new Date(subscription.current_period_end * 1000).toISOString()
            : null,
          updated_at: new Date().toISOString(),
        };

        const { data: existing } = await supabaseAdmin
          .from(CONTRACTOR_SUBSCRIPTIONS)
          .select("id")
          .eq("stripe_subscription_id", subscription.id)
          .maybeSingle();

        if (existing?.id) {
          await supabaseAdmin
            .from(CONTRACTOR_SUBSCRIPTIONS)
            .update(row)
            .eq("id", existing.id);
        } else if (planId) {
          await supabaseAdmin.from(CONTRACTOR_SUBSCRIPTIONS).insert(row);
        } else {
          const { error: updateError } = await supabaseAdmin
            .from(CONTRACTOR_SUBSCRIPTIONS)
            .update(row)
            .eq("stripe_subscription_id", subscription.id);
          if (updateError) {
            logSupabaseError(
              "[stripe-webhook-processing][customer.subscription.updated]",
              updateError,
              { subscriptionId: subscription.id, tenantId },
            );
          }
        }
      }

      if (userId && metadata.source !== "bill-payments") {
        const active = status === "active" || status === "trialing";
        await syncUserSubscriptionMetadata({
          userId,
          isSubscribed: active,
          status: active ? "active" : status === "past_due" ? "past_due" : "expired",
        });
      }

      return null;
    }

    if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object;
      const metadata = subscription.metadata || {};
      const tenantId = String(metadata.tenant_id || "");
      const userId = String(metadata.user_id || "");
      const source = String(metadata.source || "");

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
          "[stripe-webhook-processing][customer.subscription.deleted]",
          updateError,
          { subscriptionId: subscription.id, tenantId },
        );
      }

      // If this was a Bill Payments subscription, clear billPaymentsSubscribed from user metadata
      if (source === "bill-payments") {
        try {
          const { createClient } = await import("@supabase/supabase-js");
          const admin = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY,
            { auth: { autoRefreshToken: false, persistSession: false } },
          );
          let targetUserId = userId;

          if (!targetUserId && tenantId) {
            const { data: profileRow } = await admin
              .from("profiles")
              .select("id")
              .eq("tenant_id", tenantId)
              .limit(1)
              .maybeSingle();
            targetUserId = String(profileRow?.id || "");
          }

          if (targetUserId) {
            await admin.auth.admin.updateUserById(targetUserId, {
              user_metadata: { billPaymentsSubscribed: false },
            });
          }
        } catch (metaError) {
          console.error("[stripe-webhook-processing] failed to clear billPaymentsSubscribed", metaError);
        }
      } else if (userId) {
        await syncUserSubscriptionMetadata({
          userId,
          isSubscribed: false,
          status: "expired",
        });
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
          "[stripe-webhook-processing][invoice.payment_succeeded]",
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
          "[stripe-webhook-processing][invoice.payment_failed]",
          invoiceInsertError,
          { invoiceId: invoice.id, subscriptionId },
        );
      }
      return null;
    }

    return null;
  } catch (error) {
    console.error("[stripe-webhook-processing] subscription event error:", error);
    return null;
  }
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
    return jsonResponse({ success: false, error: "Missing Bill Payment metadata" }, 400);
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
      "[stripe-webhook-processing] bill payment lookup error",
      firstError,
      { transactionId, billId, tenantId, stripePaymentIntentId: intent.id },
    );
    throw new Error(firstError.message);
  }

  if (!transaction || !bill) {
    return jsonResponse({ success: false, error: "Bill payment transaction not found" }, 404);
  }

  const nextStatus = getBillPaymentStatusFromEvent(eventType);
  const fundingStatus =
    nextStatus === "paid"
      ? "funded"
      : nextStatus === "failed"
        ? "failed"
        : "processing";
  const remittanceStatus =
    fundingStatus === "funded"
      ? "pending_submission"
      : fundingStatus === "failed"
        ? "blocked"
        : "pending_funding";
  const nowIso = new Date().toISOString();
  const existingMeta =
    transaction.metadata && typeof transaction.metadata === "object"
      ? transaction.metadata
      : {};
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
      metadata: {
        ...existingMeta,
        funding_status: fundingStatus,
        remittance_status: remittanceStatus,
        remittance_channel: "manual_portal",
        remittance_reference: "",
      },
      updated_at: nowIso,
    })
    .eq("id", transaction.id)
    .eq("tenant_id", tenantId);

  if (transactionUpdateError) {
    logSupabaseError(
      "[stripe-webhook-processing] bill transaction update error",
      transactionUpdateError,
      { transactionId: transaction.id, billId, tenantId, stripePaymentIntentId: intent.id },
    );
    throw new Error(transactionUpdateError.message);
  }

  const nextBillStatus =
    nextStatus === "paid"
      ? "processing"
      : nextStatus === "processing"
        ? "processing"
        : computeBillStatus({ ...bill, status: "open" });

  const { error: billUpdateError } = await supabaseAdmin
    .from(BILLS)
    .update({
      status: nextBillStatus,
      last_paid_at: bill.last_paid_at,
      last_payment_id: transaction.id,
      updated_at: nowIso,
    })
    .eq("id", bill.id)
    .eq("tenant_id", tenantId);

  if (billUpdateError) {
    logSupabaseError(
      "[stripe-webhook-processing] bill update error",
      billUpdateError,
      { transactionId: transaction.id, billId, tenantId, stripePaymentIntentId: intent.id },
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
        ? "Funding captured, remittance pending"
        : nextStatus === "failed"
          ? "Bill payment failed"
          : "Bill payment processing",
    message:
      nextStatus === "paid"
        ? `${bill.provider_name} funding captured. Remittance status: pending submission.`
        : nextStatus === "failed"
          ? `${bill.provider_name} payment failed. ${failureReason}`.trim()
          : `${bill.provider_name} payment is still processing.`,
    metadata: {
      billId: bill.id,
      transactionId: transaction.id,
      stripePaymentIntentId: intent.id,
      fundingStatus,
      remittanceStatus,
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
        status: "processing",
        last_paid_at: bill.last_paid_at,
        last_payment_id: transaction.id,
      },
    });
  }

  return jsonResponse({
    success: true,
    billId: bill.id,
    transactionId: transaction.id,
    paymentStatus: nextStatus,
  });
}

export async function processStripeWebhookEvent(event) {
  const claim = await claimStripeWebhookEvent(event);
  if (!claim.claimed && claim.duplicate) {
    return jsonResponse({
      success: true,
      skipped: true,
      reason: "Duplicate Stripe event",
      eventId: event.id,
    });
  }

  if (event.type === "account.updated") {
    await handleConnectAccountUpdated(event.data.object);
    return jsonResponse({ success: true, eventType: event.type });
  }

  if (
    event.type.startsWith("customer.subscription.") ||
    event.type.startsWith("invoice.")
  ) {
    await handleSubscriptionEvent(event);
    return jsonResponse({ success: true, eventType: event.type });
  }

  if (event.type.startsWith("checkout.session.")) {
    const session = event.data.object;
    if (String(session?.mode || "") === "subscription") {
      return jsonResponse({
        success: true,
        eventType: event.type,
        ignored: true,
        reason: "Subscription checkout handled via customer.subscription events",
      });
    }
  }

  if (event.type.startsWith("payment_intent.")) {
    const billResponse = await handleBillPaymentIntentEvent(
      event.data.object,
      event.type,
    );
    if (billResponse) {
      return billResponse;
    }
    return jsonResponse({ success: true, ignored: true, eventType: event.type });
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
    return jsonResponse({ success: false, error: "Missing Stripe payment metadata" }, 400);
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
      "[stripe-webhook-processing] payment query error",
      paymentError,
      { paymentId, invoiceId, tenantId, sessionId: session.id },
    );
    throw new Error(paymentError.message);
  }

  if (!payment) {
    return jsonResponse({ success: false, error: "Payment not found" }, 404);
  }

  if (
    payment.stripe_session_id &&
    String(payment.stripe_session_id) !== String(session.id)
  ) {
    return jsonResponse({ success: false, error: "Stripe session mismatch for payment" }, 409);
  }

  if (
    sessionAmount > 0 &&
    Math.abs(Number(payment.amount || 0) - sessionAmount) > 0.01
  ) {
    return jsonResponse({ success: false, error: "Stripe amount mismatch for payment" }, 409);
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
    return jsonResponse({ success: true, skipped: true, reason: "Already processed" });
  }

  if (
    nextStatus === "paid" &&
    String(session.payment_status || "").toLowerCase() !== "paid"
  ) {
    return jsonResponse({ success: true, ignored: true, reason: "Session not paid" });
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
      "[stripe-webhook-processing] payment update error",
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
        "[stripe-webhook-processing] invoice update error",
        invoiceUpdateError,
        { invoiceId, tenantId, sessionId: session.id },
      );
    }
  }

  const summary = await syncInvoicePaymentSummary(access.invoice);

  return jsonResponse({
    success: true,
    invoiceId: access.invoice.id,
    paymentId: payment.id,
    paymentStatus: nextStatus,
    paidAmount: summary.paidAmount,
  });
}