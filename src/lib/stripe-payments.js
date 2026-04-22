import "server-only";
import fs from "node:fs";
import path from "node:path";
import Stripe from "stripe";
import {
  computeInvoicePaymentState,
  normalizeMoney,
  sanitizePaymentEntry,
} from "@/lib/invoice-payments";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getRequestOrigin } from "@/lib/supabase-auth";
import { logSupabaseError } from "@/lib/supabase-db";
import {
  canManageSensitive,
  forbiddenResponse,
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";

const CLIENTS = "clients";
const INVOICES = "invoices";
const JOBS = "jobs";
const PAYMENTS = "payments";

let cachedLocalEnv = null;

function getEnvFileCandidates() {
  const candidates = [];
  const visited = new Set();
  let currentDir = path.resolve(/* turbopackIgnore: true */ process.cwd());

  while (currentDir && !visited.has(currentDir)) {
    visited.add(currentDir);
    candidates.push(path.join(currentDir, ".env"));
    candidates.push(path.join(currentDir, ".env.local"));

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      break;
    }
    currentDir = parentDir;
  }

  return candidates;
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function isSuperAdmin(role) {
  return (
    String(role || "")
      .trim()
      .toLowerCase() === "super_admin"
  );
}

function buildResourceError(message, status = 409) {
  return jsonResponse({ success: false, error: message }, status);
}

function loadLocalEnvMap() {
  if (cachedLocalEnv) {
    return cachedLocalEnv;
  }

  const values = {};

  for (const envFilePath of getEnvFileCandidates()) {
    if (!fs.existsSync(envFilePath)) {
      continue;
    }

    const content = fs.readFileSync(envFilePath, "utf8");
    for (const line of content.split(/\r?\n/)) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*=/.test(line)) {
        continue;
      }

      const separatorIndex = line.indexOf("=");
      const key = line.slice(0, separatorIndex).trim();
      const rawValue = line.slice(separatorIndex + 1).trim();
      values[key] = rawValue;
    }
  }

  cachedLocalEnv = values;
  return values;
}

function getServerEnvValue(key) {
  const directValue = String(process.env[key] || "").trim();
  if (directValue) {
    return directValue;
  }

  return String(loadLocalEnvMap()[key] || "").trim();
}

export function getStripeSecretKey() {
  return getServerEnvValue("STRIPE_SECRET_KEY");
}

export function getStripeWebhookSecret() {
  return getServerEnvValue("STRIPE_WEBHOOK_SECRET");
}

export function getStripeServerClient() {
  const secret = getStripeSecretKey();
  if (!secret) return null;
  return new Stripe(secret);
}

function requireStripeClient() {
  const stripe = getStripeServerClient();
  if (!stripe) {
    throw new Error("Missing STRIPE_SECRET_KEY");
  }
  return stripe;
}

export async function createPaymentIntent(amount, currency, metadata) {
  try {
    const stripe = requireStripeClient();
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency,
      metadata,
    });
    return paymentIntent;
  } catch (error) {
    console.error("Error creating payment intent:", error);
    throw error;
  }
}

export async function createSetupIntent(customerId) {
  try {
    const stripe = requireStripeClient();
    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
    });
    return setupIntent;
  } catch (error) {
    console.error("Error creating setup intent:", error);
    throw error;
  }
}

export async function retrievePaymentMethod(paymentMethodId) {
  try {
    const stripe = requireStripeClient();
    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
    return paymentMethod;
  } catch (error) {
    console.error("Error retrieving payment method:", error);
    throw error;
  }
}

async function loadInvoiceAccessResources({ invoiceId, tenantDbId, role }) {
  let invoiceQuery = supabaseAdmin
    .from(INVOICES)
    .select("*")
    .eq("id", invoiceId);
  if (!isSuperAdmin(role)) {
    invoiceQuery = invoiceQuery.eq("tenant_id", tenantDbId);
  }

  const { data: invoice, error: invoiceError } =
    await invoiceQuery.maybeSingle();
  if (invoiceError) {
    logSupabaseError("[stripe-payments] invoice query error", invoiceError, {
      invoiceId,
      tenantDbId,
      role,
    });
    throw new Error(invoiceError.message);
  }

  if (!invoice) {
    return { response: buildResourceError("Invoice not found", 404) };
  }

  const [jobResult, clientResult] = await Promise.all([
    invoice.job_id
      ? supabaseAdmin
          .from(JOBS)
          .select("id, tenant_id, client_id, user_id")
          .eq("id", invoice.job_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    invoice.client_id
      ? supabaseAdmin
          .from(CLIENTS)
          .select("id, tenant_id, user_id")
          .eq("id", invoice.client_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (jobResult.error) {
    logSupabaseError("[stripe-payments] job query error", jobResult.error, {
      invoiceId,
      jobId: invoice.job_id,
      tenantDbId,
      role,
    });
    throw new Error(jobResult.error.message);
  }

  if (clientResult.error) {
    logSupabaseError(
      "[stripe-payments] client query error",
      clientResult.error,
      {
        invoiceId,
        clientId: invoice.client_id,
        tenantDbId,
        role,
      },
    );
    throw new Error(clientResult.error.message);
  }

  const job = jobResult.data;
  const client = clientResult.data;
  const expectedTenantId = String(invoice.tenant_id || tenantDbId || "");

  if (invoice.job_id && !job) {
    return {
      response: buildResourceError("Invoice references a missing job", 409),
    };
  }

  if (invoice.client_id && !client) {
    return {
      response: buildResourceError("Invoice references a missing client", 409),
    };
  }

  if (job && String(job.tenant_id || "") !== expectedTenantId) {
    return {
      response: buildResourceError("Job tenant mismatch for invoice", 403),
    };
  }

  if (client && String(client.tenant_id || "") !== expectedTenantId) {
    return {
      response: buildResourceError("Client tenant mismatch for invoice", 403),
    };
  }

  if (
    job &&
    client &&
    job.client_id &&
    invoice.client_id &&
    String(job.client_id) !== String(invoice.client_id)
  ) {
    return {
      response: buildResourceError(
        "Invoice job/client linkage is inconsistent",
        409,
      ),
    };
  }

  return { invoice, job, client };
}

export async function requireInvoicePaymentAccess(request, invoiceId) {
  const context = await getAuthenticatedTenantContext(request);
  if (!context.authenticated) {
    return { response: unauthenticatedResponse() };
  }

  if (!canManageSensitive(context.role)) {
    return { response: forbiddenResponse() };
  }

  const resources = await loadInvoiceAccessResources({
    invoiceId,
    tenantDbId: context.tenantDbId,
    role: context.role,
  });

  if (resources.response) {
    return resources;
  }

  return {
    context,
    invoice: resources.invoice,
    job: resources.job,
    client: resources.client,
  };
}

export async function requireWebhookPaymentResources({
  invoiceId,
  tenantId,
  jobId,
  clientId,
}) {
  const resources = await loadInvoiceAccessResources({
    invoiceId,
    tenantDbId: tenantId,
    role: null,
  });

  if (resources.response) {
    return resources;
  }

  if (jobId && String(resources.invoice.job_id || "") !== String(jobId)) {
    return {
      response: buildResourceError("Webhook job metadata mismatch", 403),
    };
  }

  if (
    clientId &&
    String(resources.invoice.client_id || "") !== String(clientId)
  ) {
    return {
      response: buildResourceError("Webhook client metadata mismatch", 403),
    };
  }

  return resources;
}

export async function listInvoicePayments(invoiceId, tenantId) {
  const query = supabaseAdmin
    .schema("public")
    .from(PAYMENTS)
    .select("*")
    .eq("invoice_id", invoiceId)
    .eq("contractor_id", tenantId)
    .order("created_at", { ascending: true });

  const { data, error } = await query;
  if (error) {
    logSupabaseError("[stripe-payments] payments query error", error, {
      invoiceId,
      tenantId,
    });
    throw new Error(error.message);
  }

  return data || [];
}

function mapCompletedPaymentRowToInvoicePayment(row) {
  const completedAt = row.completed_at || row.updated_at || row.created_at;
  return sanitizePaymentEntry({
    amount: row.amount,
    method: row.provider === "stripe" ? "credit_card" : "other",
    date: completedAt ? String(completedAt).slice(0, 10) : "",
    reference: row.stripe_session_id || row.id,
    notes:
      row.provider === "stripe"
        ? "Paid via Stripe Checkout"
        : "Imported payment record",
  });
}

export function summarizeInvoicePayments(invoice, paymentRows = []) {
  const completedPayments = paymentRows.filter((row) => {
    const status = String(row.status || "").toLowerCase();
    return status === "paid" || status === "completed";
  });
  const payments = completedPayments.map(
    mapCompletedPaymentRowToInvoicePayment,
  );
  const state = computeInvoicePaymentState({
    amount: invoice.amount,
    payments,
  });

  const latestCompleted = [...completedPayments].sort((left, right) => {
    const leftTime = new Date(
      left.completed_at || left.updated_at || left.created_at || 0,
    ).getTime();
    const rightTime = new Date(
      right.completed_at || right.updated_at || right.created_at || 0,
    ).getTime();
    return rightTime - leftTime;
  })[0];

  return {
    ...state,
    stripeLastPaymentSessionId: latestCompleted?.stripe_session_id || "",
    stripeLastPaymentAt:
      latestCompleted?.completed_at || latestCompleted?.updated_at || null,
  };
}

export async function syncInvoicePaymentSummary(invoice) {
  const paymentRows = await listInvoicePayments(invoice.id, invoice.tenant_id);
  const summary = summarizeInvoicePayments(invoice, paymentRows);

  const { error } = await supabaseAdmin
    .from(INVOICES)
    .update({
      payments: summary.payments,
      paid_amount: summary.paidAmount,
      balance_due: summary.balanceDue,
      status: summary.status,
      stripe_last_payment_session_id: summary.stripeLastPaymentSessionId,
      stripe_last_payment_at: summary.stripeLastPaymentAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", invoice.id)
    .eq("tenant_id", invoice.tenant_id);

  if (error) {
    logSupabaseError("[stripe-payments] invoice summary update error", error, {
      invoiceId: invoice.id,
      tenantId: invoice.tenant_id,
    });
    throw new Error(error.message);
  }

  return summary;
}

export async function createStripeCheckoutSessionForAccess({
  request,
  access,
  amount,
  source = "invoice_checkout",
}) {
  const stripe = getStripeServerClient();
  if (!stripe) {
    return {
      response: buildResourceError("Missing STRIPE_SECRET_KEY", 500),
    };
  }

  const paymentRows = await listInvoicePayments(
    access.invoice.id,
    access.invoice.tenant_id,
  );
  const paymentState = summarizeInvoicePayments(access.invoice, paymentRows);
  const explicitAmount = normalizeMoney(amount);
  const payableAmount =
    explicitAmount > 0 ? explicitAmount : paymentState.balanceDue;

  if (!(payableAmount > 0)) {
    return {
      response: buildResourceError(
        "This invoice has no outstanding balance",
        400,
      ),
    };
  }

  if (payableAmount > paymentState.balanceDue) {
    return {
      response: buildResourceError(
        "Requested amount exceeds outstanding balance",
        400,
      ),
    };
  }

  const paymentId = crypto.randomUUID();
  const nowIso = new Date().toISOString();

  const { error: insertError } = await supabaseAdmin
    .schema("public")
    .from(PAYMENTS)
    .insert({
      id: paymentId,
      tenant_id: access.invoice.tenant_id,
      contractor_id: access.invoice.tenant_id,
      user_id: access.context.userId || null,
      invoice_id: access.invoice.id,
      job_id: access.invoice.job_id || null,
      client_id: access.invoice.client_id || null,
      amount: payableAmount,
      currency: "usd",
      provider: "stripe",
      status: "pending",
      metadata: {
        source,
        invoiceNumber: String(access.invoice.invoice_number || ""),
      },
      created_by: access.context.userId || null,
      created_at: nowIso,
      updated_at: nowIso,
    });

  if (insertError) {
    logSupabaseError("[stripe-payments] payment insert error", insertError, {
      invoiceId: access.invoice.id,
      paymentId,
      tenantId: access.invoice.tenant_id,
      source,
    });
    throw new Error(insertError.message);
  }

  const baseUrl = getRequestOrigin(request);
  if (!baseUrl) {
    throw new Error(
      "APP_BASE_URL or APP_URL must be configured for Stripe checkout redirects",
    );
  }
  const safeBase = String(baseUrl || "").replace(/\/$/, "");
  const amountCents = Math.round(payableAmount * 100);

  try {
    const stripe = requireStripeClient();
    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        success_url: `${safeBase}/invoices?payment=success&invoiceId=${access.invoice.id}`,
        cancel_url: `${safeBase}/invoices?payment=cancel&invoiceId=${access.invoice.id}`,
        customer_email:
          String(access.invoice.client_email || "")
            .trim()
            .toLowerCase() || undefined,
        client_reference_id: paymentId,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "usd",
              unit_amount: amountCents,
              product_data: {
                name:
                  access.invoice.invoice_title ||
                  access.invoice.invoice_number ||
                  "Invoice payment",
                description: `Invoice ${access.invoice.invoice_number || access.invoice.id} for ${access.invoice.client_name || "Client"}`,
              },
            },
          },
        ],
        metadata: {
          paymentId,
          tenantId: access.invoice.tenant_id,
          companyId: access.invoice.tenant_id,
          contractorId: access.invoice.tenant_id,
          contractor_id: access.invoice.tenant_id,
          invoiceId: access.invoice.id,
          invoice_id: access.invoice.id,
          estimateId: access.invoice.estimate_id || "",
          estimate_id: access.invoice.estimate_id || "",
          jobId: access.invoice.job_id || "",
          clientId: access.invoice.client_id || "",
          invoiceNumber: String(access.invoice.invoice_number || ""),
          paymentAmount: payableAmount.toFixed(2),
          source,
        },
      },
      {
        idempotencyKey: paymentId,
      },
    );

    const updatePayload = {
      stripe_session_id: session.id,
      checkout_url: session.url || "",
      updated_at: new Date().toISOString(),
    };

    const [{ error: paymentUpdateError }, { error: invoiceUpdateError }] =
      await Promise.all([
        supabaseAdmin
          .schema("public")
          .from(PAYMENTS)
          .update(updatePayload)
          .eq("id", paymentId),
        supabaseAdmin
          .from(INVOICES)
          .update({
            last_checkout_session_id: session.id,
            last_checkout_url: session.url || "",
            updated_at: new Date().toISOString(),
          })
          .eq("id", access.invoice.id)
          .eq("tenant_id", access.invoice.tenant_id),
      ]);

    if (paymentUpdateError) {
      logSupabaseError(
        "[stripe-payments] payment session update error",
        paymentUpdateError,
        {
          invoiceId: access.invoice.id,
          paymentId,
          tenantId: access.invoice.tenant_id,
        },
      );
      throw new Error(paymentUpdateError.message);
    }

    if (invoiceUpdateError) {
      logSupabaseError(
        "[stripe-payments] invoice checkout update error",
        invoiceUpdateError,
        {
          invoiceId: access.invoice.id,
          paymentId,
          tenantId: access.invoice.tenant_id,
        },
      );
      throw new Error(invoiceUpdateError.message);
    }

    return {
      paymentId,
      payableAmount,
      sessionId: session.id,
      checkoutUrl: session.url || "",
    };
  } catch (error) {
    await supabaseAdmin
      .schema("public")
      .from(PAYMENTS)
      .delete()
      .eq("id", paymentId);
    throw error;
  }
}

/**
 * Attach a Plaid-linked bank account to a Stripe customer using a one-time bank account token.
 * Stripe stores this as a reusable customer bank account source that can be charged via PaymentIntents.
 */
export async function attachPlaidBankAccountToStripeCustomer(
  stripeCustomerId,
  processorToken,
) {
  const stripe = getStripeServerClient();
  if (!stripe) throw new Error("Stripe is not configured");

  const bankAccount = await stripe.customers.createSource(stripeCustomerId, {
    source: processorToken,
  });

  if (!bankAccount || bankAccount.object !== "bank_account") {
    throw new Error("Stripe did not return a customer bank account source");
  }

  return bankAccount;
}
