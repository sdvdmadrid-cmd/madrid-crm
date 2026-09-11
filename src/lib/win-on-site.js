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
import { isPlatformFeatureEnabled } from "@/lib/platform-feature-flags";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  buildWinOnSitePrompt,
  mergeWinOnSiteLeadMetadata,
  WIN_ON_SITE_MAX_PHOTOS,
  WIN_ON_SITE_PHASE,
} from "@/lib/win-on-site-helpers";

export {
  buildWinOnSitePrompt,
  mergeWinOnSiteLeadMetadata,
  normalizeLeadPhotoDataUrls,
  readDraftEstimateIdFromMetadata,
  WIN_ON_SITE_MAX_PHOTOS,
  WIN_ON_SITE_PHASE,
} from "@/lib/win-on-site-helpers";

async function resolveEstimateDraftForLead({
  request = null,
  tenantId,
  prompt,
  serviceNeeded,
  description,
  clientName,
  address,
}) {
  const enabled = await isPlatformFeatureEnabled("feature_ai_estimate", true);
  if (enabled) {
    try {
      const result = await generateEstimateDraftFromText({
        request,
        tenantId,
        userId: null,
        prompt,
        feature: "win_on_site_estimate",
      });
      if (result?.draft?.services?.length) {
        return { draft: result.draft, source: "ai" };
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
  };
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
} = {}) {
  try {
    if (!tenantId || !leadId) return { ok: false, reason: "missing_ids" };

    const prompt = buildWinOnSitePrompt({
      serviceNeeded,
      description,
      address,
      budgetRange,
      timeline,
      clientName,
      photoUrls,
    });

    const { draft, source } = await resolveEstimateDraftForLead({
      request,
      tenantId,
      prompt,
      serviceNeeded,
      description,
      clientName,
      address,
    });

    const services =
      Array.isArray(draft.services) && draft.services.length
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

    const { data: numberRows } = await supabaseAdmin
      .from("estimates")
      .select("estimate_number, created_at")
      .eq("tenant_id", tenantId)
      .ilike("estimate_number", "EST-%")
      .order("created_at", { ascending: false })
      .limit(50);

    const estimateNumber = formatEstimateNumber(
      pickMaxEstimateSequence(numberRows || []) + 1,
    );

    const noteParts = [
      "Win on Site auto-draft (phase 1)",
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
    };
  } catch (error) {
    console.warn("[win-on-site] create draft failed", error?.message || error);
    return { ok: false, reason: "exception" };
  }
}
