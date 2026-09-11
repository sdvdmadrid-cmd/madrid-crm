import "server-only";

import {
  buildHeuristicEstimateDraft,
  generateEstimateDraftFromText,
} from "@/lib/ai-estimate-draft";
import { stringifyEstimateNotes } from "@/lib/estimate-notes";
import {
  formatEstimateNumber,
  pickMaxEstimateSequence,
} from "@/lib/estimate-number";
import {
  formatInvoiceNumber,
  INVOICE_LOOKUP_LIMIT,
  pickMaxInvoiceSequence,
} from "@/lib/invoice-number";
import { isPlatformFeatureEnabled } from "@/lib/platform-feature-flags";
import { createStripeCheckoutSessionForInvoice } from "@/lib/stripe-payments";
import { CONNECT_PAYOUT_REQUIRED_CODE } from "@/lib/stripe-connect";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  buildWinOnSitePrompt,
  mergeWinOnSiteLeadMetadata,
  WIN_ON_SITE_MAX_PHOTOS,
  WIN_ON_SITE_PHASE,
} from "@/lib/win-on-site-helpers";
import {
  buildWinOnSitePackages,
  normalizeWinOnSitePackageTier,
  selectWinOnSitePackage,
  WIN_ON_SITE_DEPOSIT_PERCENT,
} from "@/lib/win-on-site-packages";

export {
  buildWinOnSitePrompt,
  mergeWinOnSiteLeadMetadata,
  normalizeLeadPhotoDataUrls,
  readDraftEstimateIdFromMetadata,
  WIN_ON_SITE_MAX_PHOTOS,
  WIN_ON_SITE_PHASE,
} from "@/lib/win-on-site-helpers";

export {
  buildWinOnSitePackages,
  computeDepositAmount,
  normalizeWinOnSitePackageTier,
  selectWinOnSitePackage,
  serializeWinOnSitePackagesForPublic,
  WIN_ON_SITE_DEPOSIT_PERCENT,
  WIN_ON_SITE_PACKAGE_TIERS,
} from "@/lib/win-on-site-packages";

/**
 * Resolve a priced base draft without writing to DB (for package preview + submit).
 */
export async function resolveWinOnSiteBaseDraft({
  request = null,
  tenantId,
  serviceNeeded = "",
  description = "",
  address = "",
  budgetRange = "",
  timeline = "",
  clientName = "",
  photoUrls = [],
} = {}) {
  const prompt = buildWinOnSitePrompt({
    serviceNeeded,
    description,
    address,
    budgetRange,
    timeline,
    clientName,
    photoUrls,
  });

  const enabled = await isPlatformFeatureEnabled("feature_ai_estimate", true);
  if (enabled && tenantId) {
    try {
      const result = await generateEstimateDraftFromText({
        request,
        tenantId,
        userId: null,
        prompt,
        feature: "win_on_site_estimate",
      });
      if (result?.draft?.services?.length) {
        return { draft: result.draft, source: "ai", prompt };
      }
    } catch (error) {
      console.warn(
        "[win-on-site] AI draft failed, falling back to heuristic",
        error?.message || error,
      );
    }
  }

  return {
    draft: buildHeuristicEstimateDraft({
      title: serviceNeeded || "Website lead estimate",
      service: serviceNeeded,
      details: description,
      clientName,
      address,
    }),
    source: "heuristic",
    prompt,
  };
}

async function allocateEstimateNumber(tenantId) {
  const { data: numberRows } = await supabaseAdmin
    .from("estimates")
    .select("estimate_number, created_at")
    .eq("tenant_id", tenantId)
    .ilike("estimate_number", "EST-%")
    .order("created_at", { ascending: false })
    .limit(50);

  return formatEstimateNumber(pickMaxEstimateSequence(numberRows || []) + 1);
}

async function allocateInvoiceNumber(tenantId) {
  const { data: numberRows } = await supabaseAdmin
    .from("invoices")
    .select("invoice_number")
    .eq("tenant_id", tenantId)
    .ilike("invoice_number", "INV-%")
    .order("created_at", { ascending: false })
    .limit(INVOICE_LOOKUP_LIMIT);

  return formatInvoiceNumber(pickMaxInvoiceSequence(numberRows || []) + 1);
}

/**
 * Create a draft estimate for a website lead and attach its id on lead metadata.
 * Soft-fails: never throws to the public contact path.
 */
export async function createWinOnSiteEstimateForLead({
  request = null,
  tenantId,
  leadId,
  clientId = null,
  clientName = "",
  clientEmail = "",
  clientPhone = "",
  serviceNeeded = "",
  description = "",
  address = "",
  budgetRange = "",
  timeline = "",
  photoUrls = [],
  existingMetadata = {},
  packageTier = "better",
} = {}) {
  try {
    if (!tenantId || !leadId) return { ok: false, reason: "missing_ids" };

    const { draft, source } = await resolveWinOnSiteBaseDraft({
      request,
      tenantId,
      serviceNeeded,
      description,
      address,
      budgetRange,
      timeline,
      clientName,
      photoUrls,
    });

    const packages = buildWinOnSitePackages(draft);
    const selectedTier = normalizeWinOnSitePackageTier(packageTier, "better");
    const selected = selectWinOnSitePackage(packages, selectedTier);

    const services =
      Array.isArray(selected?.services) && selected.services.length
        ? selected.services
        : Array.isArray(draft.services) && draft.services.length
          ? draft.services
          : [
              {
                id: "lead-line-1",
                name: serviceNeeded || "Service",
                qty: 1,
                unitPrice: 0,
                price: 0,
              },
            ];
    const subtotal = services.reduce((sum, s) => sum + (Number(s.price) || 0), 0);
    const nowIso = new Date().toISOString();
    const estimateNumber = await allocateEstimateNumber(tenantId);

    const noteParts = [
      `Win on Site auto-draft (phase ${WIN_ON_SITE_PHASE})`,
      `Selected package: ${selected?.label || selectedTier}`,
      description ? `Lead notes:\n${description}` : "",
      draft.scopeNotes ? `AI scope:\n${draft.scopeNotes}` : "",
      Array.isArray(draft.assumptions) && draft.assumptions.length
        ? `Assumptions:\n- ${draft.assumptions.join("\n- ")}`
        : "",
    ].filter(Boolean);

    const { data: insertedEstimate, error: estimateError } = await supabaseAdmin
      .from("estimates")
      .insert({
        tenant_id: tenantId,
        user_id: null,
        created_by: null,
        client_name:
          String(draft.clientName || clientName || `Lead estimate - ${serviceNeeded || "New"}`)
            .trim()
            .slice(0, 200) || "Website lead estimate",
        estimate_number: estimateNumber,
        status: "draft",
        currency: "USD",
        items: services,
        subtotal,
        tax: 0,
        total: subtotal,
        notes: stringifyEstimateNotes({
          address: String(draft.address || address || "").trim(),
          noteText: noteParts.join("\n\n"),
          clientUuid: clientId || "",
          clientEmail: clientEmail || "",
          clientPhone: clientPhone || "",
        }),
        created_at: nowIso,
        updated_at: nowIso,
      })
      .select("id, client_name, total")
      .single();

    if (estimateError || !insertedEstimate?.id) {
      console.warn(
        "[win-on-site] estimate insert failed",
        estimateError?.message || estimateError,
      );
      return { ok: false, reason: "estimate_insert_failed" };
    }

    const metadata = mergeWinOnSiteLeadMetadata(existingMetadata, {
      draftEstimateId: insertedEstimate.id,
      photoUrls: (photoUrls || []).filter(Boolean).slice(0, WIN_ON_SITE_MAX_PHOTOS),
      winOnSite: {
        phase: WIN_ON_SITE_PHASE,
        createdAt: nowIso,
        source,
        subtotal,
        packageTier: selectedTier,
        packageLabel: selected?.label || selectedTier,
        packageTotal: subtotal,
        depositPercent: WIN_ON_SITE_DEPOSIT_PERCENT,
        depositAmount: selected?.depositAmount || 0,
        depositStatus: "pending",
      },
    });

    const { error: metaError } = await supabaseAdmin
      .from("contractor_website_leads")
      .update({ metadata, updated_at: nowIso })
      .eq("id", leadId)
      .eq("tenant_id", tenantId);

    if (metaError) {
      console.warn("[win-on-site] lead metadata update failed", metaError?.message || metaError);
    }

    return {
      ok: true,
      estimateId: insertedEstimate.id,
      source,
      subtotal,
      metadata,
      packages,
      selectedPackage: selected,
      packageTier: selectedTier,
    };
  } catch (error) {
    console.warn("[win-on-site] create draft failed", error?.message || error);
    return { ok: false, reason: "exception" };
  }
}

/**
 * Create deposit invoice + Stripe checkout for a Win on Site lead.
 * Soft-fails with a reason code; never throws to public callers.
 */
export async function createWinOnSiteDepositCheckout({
  request,
  tenantId,
  slug,
  leadId,
  clientId = null,
  clientName = "",
  clientEmail = "",
  estimateId = null,
  selectedPackage = null,
  existingMetadata = {},
} = {}) {
  try {
    const total = Number(selectedPackage?.total || 0);
    const depositAmount = Number(selectedPackage?.depositAmount || 0);
    if (!(total > 0) || !(depositAmount > 0)) {
      return { ok: false, skipped: true, reason: "zero_total" };
    }
    if (!tenantId || !leadId) {
      return { ok: false, skipped: true, reason: "missing_ids" };
    }

    const nowIso = new Date().toISOString();
    let invoiceNumber = await allocateInvoiceNumber(tenantId);
    let insertedInvoice = null;
    let lastError = null;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const insertResult = await supabaseAdmin
        .from("invoices")
        .insert({
          tenant_id: tenantId,
          user_id: null,
          created_by: null,
          client_id: clientId || null,
          client_name: clientName || "Website lead",
          client_email: clientEmail || null,
          invoice_number: invoiceNumber,
          invoice_title: `Deposit — ${selectedPackage?.label || "Package"} (${selectedPackage?.title || "Website project"})`,
          status: "Sent",
          amount: total,
          items: selectedPackage?.services || [],
          subtotal_cents: Math.round(total * 100),
          tax_cents: 0,
          total_cents: Math.round(total * 100),
          paid_amount: 0,
          balance_due: total,
          payments: [],
          notes: `Win on Site deposit (${WIN_ON_SITE_DEPOSIT_PERCENT}%). Lead ${leadId}.`,
          estimate_id: estimateId || null,
          created_at: nowIso,
          updated_at: nowIso,
        })
        .select("*")
        .single();

      if (!insertResult.error) {
        insertedInvoice = insertResult.data;
        lastError = null;
        break;
      }
      lastError = insertResult.error;
      const code = String(insertResult.error.code || "");
      const msg = String(insertResult.error.message || "");
      if (!(code === "23505" || /duplicate key value/i.test(msg))) break;
      invoiceNumber = await allocateInvoiceNumber(tenantId);
    }

    if (lastError || !insertedInvoice?.id) {
      console.warn(
        "[win-on-site] deposit invoice insert failed",
        lastError?.message || lastError,
      );
      return { ok: false, skipped: true, reason: "invoice_insert_failed" };
    }

    const safeSlug = String(slug || "").trim();
    const successUrl = `/sites/${encodeURIComponent(safeSlug)}/request?deposit=success&leadId=${encodeURIComponent(leadId)}`;
    const cancelUrl = `/sites/${encodeURIComponent(safeSlug)}/request?deposit=cancel&leadId=${encodeURIComponent(leadId)}`;

    const checkout = await createStripeCheckoutSessionForInvoice({
      request,
      invoice: insertedInvoice,
      amount: depositAmount,
      source: "win_on_site_deposit",
      successUrl,
      cancelUrl,
      userId: null,
    });

    if (checkout?.errorCode || checkout?.response) {
      const reason =
        checkout.errorCode === CONNECT_PAYOUT_REQUIRED_CODE ||
        checkout?.code === CONNECT_PAYOUT_REQUIRED_CODE
          ? "connect_required"
          : checkout?.reason || "stripe_missing";
      const metadata = mergeWinOnSiteLeadMetadata(existingMetadata, {
        winOnSite: {
          depositStatus: "skipped",
          depositSkipReason: reason,
          invoiceId: insertedInvoice.id,
        },
      });
      await supabaseAdmin
        .from("contractor_website_leads")
        .update({ metadata, updated_at: nowIso })
        .eq("id", leadId)
        .eq("tenant_id", tenantId);
      return {
        ok: false,
        skipped: true,
        reason,
        invoiceId: insertedInvoice.id,
        metadata,
      };
    }

    if (!checkout?.checkoutUrl) {
      return {
        ok: false,
        skipped: true,
        reason: "stripe_missing",
        invoiceId: insertedInvoice.id,
      };
    }

    const metadata = mergeWinOnSiteLeadMetadata(existingMetadata, {
      winOnSite: {
        depositStatus: "checkout_created",
        depositAmount,
        invoiceId: insertedInvoice.id,
        checkoutSessionId: checkout.sessionId || "",
      },
    });
    await supabaseAdmin
      .from("contractor_website_leads")
      .update({ metadata, updated_at: nowIso })
      .eq("id", leadId)
      .eq("tenant_id", tenantId);

    return {
      ok: true,
      invoiceId: insertedInvoice.id,
      depositAmount,
      checkoutUrl: checkout.checkoutUrl,
      sessionId: checkout.sessionId,
      metadata,
    };
  } catch (error) {
    console.warn("[win-on-site] deposit checkout failed", error?.message || error);
    const message = String(error?.message || "");
    const reason = /STRIPE_SECRET_KEY|stripe/i.test(message)
      ? "stripe_missing"
      : /Connect|payout/i.test(message)
        ? "connect_required"
        : "exception";
    return { ok: false, skipped: true, reason };
  }
}
