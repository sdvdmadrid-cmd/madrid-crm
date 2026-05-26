import { buildEstimateBuilderInsertRow } from "@/lib/estimate-builder-records";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { assertTenantClient } from "@/lib/tenant-fk-validation";
import {
  canWrite,
  forbiddenResponse,
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";

// Tabla relacional: estimate_builder

/**
 * See estimate-builder-records.js for the table layout. Numbering follows the
 * same max-suffix-plus-one strategy used by /api/estimates so that concurrent
 * creates don't collide. Orders by `created_at desc` instead of by the
 * estimate_number column to avoid the lexicographic-vs-numeric pitfall at
 * the EST-9999 -> EST-10000 boundary (where "EST-10000" sorts below
 * "EST-9999" alphabetically and a small LIMIT misses it).
 */
async function nextEstimateBuilderNumber(tenantId) {
  const { data, error } = await supabaseAdmin
    .from("estimate_builder")
    .select("estimate_number, created_at")
    .eq("tenant_id", tenantId)
    .ilike("estimate_number", "EST-%")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) throw new Error(error.message);

  let max = 0;
  for (const row of data || []) {
    const match = String(row.estimate_number || "").match(/^EST-(\d+)$/i);
    if (match) {
      const n = Number(match[1]);
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  return `EST-${String(max + 1).padStart(4, "0")}`;
}

/**
 * Serialize a raw estimate_builder row into the public API shape. The
 * frontend (src/app/estimate-builder/page.js) reads camelCase keys like
 * `clientId`, `quoteId`, and `lastSentAt`. Those used to be quoted columns
 * on the table; they were dropped in
 * 20260531100000_drop_estimate_builder_camelcase_columns.sql. We now
 * synthesize the aliases from the canonical snake_case columns so the
 * response contract stays the same.
 */
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
    clientId: doc.client_id || doc.clientId || null,
    quoteId: doc.quote_id || doc.quoteId || null,
    lastSentAt: doc.last_sent_at || doc.lastSentAt || null,
    createdAt,
    updatedAt,
  };
};

export async function GET(request) {
  try {
    const { tenantDbId, role, authenticated } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) {
      return unauthenticatedResponse();
    }

    let query = supabaseAdmin
      .from("estimate_builder")
      .select("*")
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: false });

    if ((role || "").toLowerCase() !== "super_admin") {
      query = query.eq("tenant_id", tenantDbId);
    }

    const { data, error } = await query;
    if (error) {
      console.error("[api/estimate-builder][GET] Supabase query error", error);
      throw new Error(error.message);
    }

    return new Response(JSON.stringify((data || []).map(serialize)), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[api/estimate-builder][GET] Supabase error", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}

export async function POST(request) {
  try {
    const { tenantDbId, role, userId, authenticated } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) {
      return unauthenticatedResponse();
    }

    if (!canWrite(role)) {
      return forbiddenResponse();
    }

    const body = await request.json();
    const nowIso = new Date().toISOString();

    const clientId = String(body.client_id || body.clientId || "").trim();
    if (!clientId) {
      return new Response(
        JSON.stringify({ success: false, error: "client_id is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const clientCheck = await assertTenantClient({
      tenantDbId,
      role,
      clientId,
    });
    if (!clientCheck.ok) {
      return new Response(
        JSON.stringify({ success: false, error: clientCheck.error }),
        { status: clientCheck.status, headers: { "Content-Type": "application/json" } },
      );
    }

    const userProvidedNumber = String(
      body.estimate_number || body.estimateNumber || "",
    ).trim();

    // Retry on unique-constraint violation so concurrent creates don't
    // collide on the same EST-#### (paired with the partial unique index
    // added in 20260528200000).
    let data = null;
    let lastError = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const estimateNumber =
        attempt === 0 && userProvidedNumber
          ? userProvidedNumber
          : await nextEstimateBuilderNumber(tenantDbId);

      const toInsert = buildEstimateBuilderInsertRow(body, {
        tenantDbId,
        userId,
        estimateNumber,
      });

      const insertResult = await supabaseAdmin
        .from("estimate_builder")
        .insert(toInsert)
        .select("*")
        .single();

      if (!insertResult.error) {
        data = insertResult.data;
        lastError = null;
        break;
      }
      lastError = insertResult.error;
      const code = String(insertResult.error.code || "");
      const msg = String(insertResult.error.message || "");
      const isUniqueViolation = code === "23505" || /duplicate key value/i.test(msg);
      if (!isUniqueViolation) break;
      if (userProvidedNumber && attempt === 0) {
        return new Response(
          JSON.stringify({
            success: false,
            error: `Estimate number ${userProvidedNumber} is already in use.`,
          }),
          { status: 409, headers: { "Content-Type": "application/json" } },
        );
      }
    }

    if (lastError) {
      console.error(
        "[api/estimate-builder][POST] Supabase insert error",
        lastError,
      );
      throw new Error(lastError.message);
    }
    if (!data) throw new Error("Failed to allocate a unique estimate number");

    return new Response(
      JSON.stringify({ success: true, data: serialize(data) }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("[api/estimate-builder][POST] Supabase error", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
