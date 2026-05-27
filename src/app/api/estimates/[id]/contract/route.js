import { supabaseAdmin } from "@/lib/supabase-admin";
import { enforceSameOriginForMutation } from "@/lib/request-security";
import { generateContractAssistant } from "@/lib/document-ai";
import { parseEstimateNotes } from "@/lib/estimate-notes";
import {
  canWrite,
  forbiddenResponse,
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";

const ESTIMATES_TABLE = "estimates";
const CONTRACTS_TABLE = "contracts";

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function buildScopeFromItems(items, fallbackNote) {
  if (!Array.isArray(items) || items.length === 0) {
    return fallbackNote || "Project scope as discussed.";
  }
  const lines = items
    .filter((it) => {
      const name = String(it?.name || "").trim().toLowerCase();
      return name && name !== "discount";
    })
    .map((it) => {
      const name = String(it?.name || "Service");
      const qty = Number(it?.qty || 1);
      const price = Number(it?.price ?? it?.unitPrice ?? 0);
      const total = Number.isFinite(price) ? price.toFixed(2) : "0.00";
      return `- ${name} (qty ${qty}) — $${total}`;
    });
  if (lines.length === 0) return fallbackNote || "Project scope as discussed.";
  if (fallbackNote) {
    lines.push("", fallbackNote);
  }
  return lines.join("\n");
}

/**
 * POST /api/estimates/[id]/contract
 *
 * Generates a contract draft (and optionally persists it as a row in the
 * `contracts` table) from an existing estimate. Powers the AI bubble's
 * "Generate contract from this estimate" action.
 *
 * Body shape:
 *   - category?: string  (e.g. "Snowplowing", "Roofing"; defaults to "Service")
 *   - option?: string    (sub-category, optional)
 *   - language?: "en"|"es"|"pl"
 *   - additionalTerms?: string  (free-form extra clauses)
 *   - persist?: boolean         (when true, saves to the contracts table)
 */
export async function POST(request, { params }) {
  try {
    // Single same-origin / Referer guard. Previously this route
    // invoked the same check twice: once as
    // enforceSameOriginForMutation, again as applyMutationCsrfGuard
    // (which is a one-line wrapper around the same function). Pure
    // dead work, and confusing because it implied two layers of
    // CSRF enforcement when only one exists.
    const sameOriginBlock = enforceSameOriginForMutation(request);
    if (sameOriginBlock) return sameOriginBlock;

    const { tenantDbId, role, authenticated } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) return unauthenticatedResponse();
    if (!canWrite(role)) return forbiddenResponse();

    const { id } = await params;
    if (!id) return jsonResponse({ success: false, error: "Invalid estimate id" }, 400);

    const body = await request.json().catch(() => ({}));
    const category = String(body.category || "").trim() || "Service";
    const option = String(body.option || "").trim();
    const language = ["en", "es", "pl"].includes(String(body.language || "").toLowerCase())
      ? String(body.language).toLowerCase()
      : "en";
    const additionalTerms = String(body.additionalTerms || "").trim();
    const persist = body.persist === true;

    // Tenant-scoped lookup. Super admins bypass the scope filter.
    let query = supabaseAdmin
      .from(ESTIMATES_TABLE)
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if ((role || "").toLowerCase() !== "super_admin") {
      query = query.eq("tenant_id", tenantDbId);
    }
    const { data: estimate, error: fetchError } = await query;
    if (fetchError) throw new Error(fetchError.message);
    if (!estimate) {
      return jsonResponse({ success: false, error: "Estimate not found" }, 404);
    }

    const parsedNotes = parseEstimateNotes(estimate.notes);
    const items = Array.isArray(estimate.items) ? estimate.items : [];
    const total = Number(estimate.total || 0);
    const scopeDetails = buildScopeFromItems(items, parsedNotes.noteText);

    const contractAssistantInput = {
      language,
      category,
      option,
      clientName: estimate.client_name || "",
      jobTitle:
        option ||
        category ||
        (estimate.estimate_number ? `Estimate ${estimate.estimate_number}` : "Project"),
      amount: Number.isFinite(total) ? total.toFixed(2) : "0.00",
      scopeDetails,
      dueDate: "",
      status: "Draft",
      additionalTerms,
    };

    const { body: contractBody } = generateContractAssistant(contractAssistantInput);

    if (!persist) {
      return jsonResponse({
        success: true,
        data: {
          body: contractBody,
          preview: {
            category,
            option,
            language,
            clientName: estimate.client_name || "",
            estimateNumber: estimate.estimate_number || "",
            amount: Number(total).toFixed(2),
            address: parsedNotes.address,
          },
        },
      });
    }

    // Persist to the contracts table. Fields kept minimal — the body carries
    // the rendered text, and the references travel via client_name + amount.
    // We intentionally do NOT set job_id or invoice_id here, since the
    // contract is being created from an estimate (no job exists yet).
    const insertPayload = {
      tenant_id: tenantDbId,
      client_id: estimate.client_id || null,
      client_name: estimate.client_name || "",
      job_id: estimate.job_id || null,
      job_title: contractAssistantInput.jobTitle,
      invoice_id: null,
      invoice_number: null,
      amount: Number.isFinite(total) ? total : 0,
      status: "draft",
      contract_language: language,
      contract_category: category,
      contract_option: option || null,
      body: contractBody,
    };

    const { data: inserted, error: insertError } = await supabaseAdmin
      .from(CONTRACTS_TABLE)
      .insert([insertPayload])
      .select("*")
      .maybeSingle();

    if (insertError) {
      console.error(
        "[api/estimates/:id/contract] insert failed",
        insertError.message,
      );
      return jsonResponse(
        { success: false, error: "Unable to save contract.", body: contractBody },
        500,
      );
    }

    return jsonResponse({
      success: true,
      data: {
        contract: inserted,
        body: contractBody,
      },
    });
  } catch (error) {
    console.error("[api/estimates/:id/contract] error", error);
    return jsonResponse(
      { success: false, error: error?.message || "Unable to generate contract" },
      500,
    );
  }
}
