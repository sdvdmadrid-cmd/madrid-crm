import { supabaseAdmin } from "@/lib/supabase-admin";
import { enforceSameOriginForMutation } from "@/lib/request-security";
import {
  canDelete,
  canWrite,
  forbiddenResponse,
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";

// Tabla relacional: estimate_builder

const serialize = (doc) => {
  const createdAt = doc.created_at || doc.createdAt || null;
  const updatedAt = doc.updated_at || doc.updatedAt || null;

  return {
    ...doc,
    _id: doc.id,
    id: doc.id,
    tenantId: doc.tenant_id || doc.tenantId || null,
    userId: doc.user_id || doc.userId || null,
    createdBy: doc.created_by || doc.createdBy || null,
    createdAt,
    updatedAt,
  };
};

export async function PATCH(request, { params }) {
  try {
    const csrfResponse = enforceSameOriginForMutation(request);
    if (csrfResponse) return csrfResponse;

    const { tenantDbId, role, authenticated } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) {
      return unauthenticatedResponse();
    }

    if (!canWrite(role)) {
      return forbiddenResponse();
    }
    const { id } = await params;
    if (!id) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid estimate id" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const body = await request.json();

    let estimateQuery = supabaseAdmin
      .from("estimate_builder")
      .select("id,quote_id")
      .eq("id", id)
      .maybeSingle();
    if ((role || "").toLowerCase() !== "super_admin") {
      estimateQuery = estimateQuery.eq("tenant_id", tenantDbId);
    }

    const { data: estimateDoc, error: estimateQueryError } = await estimateQuery;
    if (estimateQueryError) {
      console.error(
        "[api/estimate-builder/:id][PATCH] Supabase estimate lookup error",
        estimateQueryError,
      );
      throw new Error(estimateQueryError.message);
    }

    if (!estimateDoc) {
      return new Response(
        JSON.stringify({ success: false, error: "Estimate not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    }

    const quoteId = String(estimateDoc.quote_id || "").trim();

    let linkedQuote = null;
    if (quoteId) {
      let linkedQuoteByIdQuery = supabaseAdmin
        .from("quotes")
        .select("id,status")
        .eq("id", quoteId)
        .maybeSingle();
      if ((role || "").toLowerCase() !== "super_admin") {
        linkedQuoteByIdQuery = linkedQuoteByIdQuery.eq("tenant_id", tenantDbId);
      }

      const { data: linkedQuoteById, error: linkedQuoteByIdError } =
        await linkedQuoteByIdQuery;
      if (linkedQuoteByIdError) {
        console.error(
          "[api/estimate-builder/:id][PATCH] Supabase linked quote by id query error",
          linkedQuoteByIdError,
        );
        throw new Error(linkedQuoteByIdError.message);
      }
      linkedQuote = linkedQuoteById || null;
    }

    const linkedQuoteStatus = String(linkedQuote?.status || "").toLowerCase();
    const removeQuoteSignature = body.removeQuoteSignature === true;

    if (linkedQuote && linkedQuoteStatus === "signed" && !removeQuoteSignature) {
      return new Response(
        JSON.stringify({
          success: false,
          error:
            "Quote is signed and locked. Remove signature before editing this estimate.",
        }),
        { status: 409, headers: { "Content-Type": "application/json" } },
      );
    }

    if (linkedQuote && linkedQuoteStatus === "signed" && removeQuoteSignature) {
      let unlockQuery = supabaseAdmin
        .from("quotes")
        .update({
          status: "approved",
          updated_at: new Date().toISOString(),
        })
        .eq("id", linkedQuote.id);

      if ((role || "").toLowerCase() !== "super_admin") {
        unlockQuery = unlockQuery.eq("tenant_id", tenantDbId);
      }

      const { error: unlockError } = await unlockQuery;
      if (unlockError) {
        console.error(
          "[api/estimate-builder/:id][PATCH] Supabase quote unlock error",
          unlockError,
        );
        throw new Error(unlockError.message);
      }
    }

    if ("removeQuoteSignature" in body) {
      delete body.removeQuoteSignature;
    }

    const updateRow = {
      ...body,
      updated_at: new Date().toISOString(),
    };

    let query = supabaseAdmin
      .from("estimate_builder")
      .update(updateRow)
      .eq("id", id)
      .select("*")
      .maybeSingle();

    if ((role || "").toLowerCase() !== "super_admin") {
      query = query.eq("tenant_id", tenantDbId);
    }

    const { data, error } = await query;
    if (error) {
      console.error(
        "[api/estimate-builder/:id][PATCH] Supabase update error",
        error,
      );
      throw new Error(error.message);
    }

    if (!data) {
      return new Response(
        JSON.stringify({ success: false, error: "Estimate not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ success: true, data: serialize(data) }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[api/estimate-builder/:id][PATCH] Supabase error", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}

export async function DELETE(request, { params }) {
  try {
    const csrfResponse = enforceSameOriginForMutation(request);
    if (csrfResponse) return csrfResponse;

    const { tenantDbId, role, authenticated } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) {
      return unauthenticatedResponse();
    }

    if (!canDelete(role)) {
      return forbiddenResponse();
    }
    const { id } = await params;
    if (!id) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid estimate id" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    let query = supabaseAdmin.from("estimate_builder").delete().eq("id", id);
    if ((role || "").toLowerCase() !== "super_admin") {
      query = query.eq("tenant_id", tenantDbId);
    }

    const { data, error } = await query.select("id");
    if (error) {
      console.error(
        "[api/estimate-builder/:id][DELETE] Supabase delete error",
        error,
      );
      throw new Error(error.message);
    }

    if (!data || data.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: "Estimate not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[api/estimate-builder/:id][DELETE] Supabase error", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
