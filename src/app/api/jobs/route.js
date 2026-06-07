import { attachFreshPartyToJobDbRow } from "@/lib/client-document-party";
import { listJobsForTenant, serializeJobRow } from "@/lib/jobs-list-server";
import { sanitizePayloadDeep } from "@/lib/input-sanitizer";
import { trackMarketingEvent } from "@/lib/marketing-analytics";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { logSupabaseError, normalizeUuid } from "@/lib/supabase-db";
import { applyMutationCsrfGuard } from "@/lib/mutation-guard";
import {
  canWrite,
  forbiddenResponse,
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";
import { getListPaginationParams, scopeByTenant, applyUnpaginatedSafetyLimit } from "@/lib/tenant-scope";

const JOBS = "jobs";

const serialize = serializeJobRow;

function buildInsertRow(body, tenantId, userId) {
  const now = new Date().toISOString();
  return {
    tenant_id: tenantId,
    user_id: userId || null,
    title: String(body.title || "").trim(),
    description: String(body.description || "").trim(),
    client_id: normalizeUuid(body.clientId),
    client_name: String(body.clientName || "").trim(),
    service: String(body.service || "").trim(),
    status: String(body.status || "Pending").trim() || "Pending",
    price: String(body.price || "").trim(),
    due_date: String(body.dueDate || "").trim(),
    tax_state: String(body.taxState || "").trim(),
    down_payment_percent: String(body.downPaymentPercent || "0").trim() || "0",
    scope_details: String(body.scopeDetails || "").trim(),
    square_meters: String(body.squareMeters || "").trim(),
    complexity: String(body.complexity || "standard").trim() || "standard",
    materials_included:
      typeof body.materialsIncluded === "boolean"
        ? body.materialsIncluded
        : true,
    travel_minutes: String(body.travelMinutes || "").trim(),
    urgency: String(body.urgency || "flexible").trim() || "flexible",
    estimate_snapshot: body.estimateSnapshot || null,
    invoiced: typeof body.invoiced === "boolean" ? body.invoiced : false,
    created_by: userId || null,
    created_at: now,
    updated_at: now,
  };
}

export async function GET(request) {
  try {
    const { tenantDbId, role, authenticated } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) {
      return unauthenticatedResponse();
    }

    const { searchParams } = new URL(request.url);
    const { paginate, page, limit, from, to } =
      getListPaginationParams(searchParams);

    if (paginate) {
      const payload = await listJobsForTenant({
        tenantDbId,
        role,
        page,
        limit,
      });
      trackMarketingEvent("jobs_view", {
        tenantId: tenantDbId,
        role,
        page: payload.page,
        limit: payload.limit,
        total: payload.total,
      });
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    let query = scopeByTenant(
      supabaseAdmin
        .from(JOBS)
        .select("*", { count: paginate ? "exact" : undefined })
        .order("created_at", { ascending: false }),
      { tenantDbId, role },
    );

    if (paginate) {
      query = query.range(from, to);
    } else {
      query = applyUnpaginatedSafetyLimit(query, paginate);
    }

    const { data, error, count } = await query;
    if (error) {
      logSupabaseError("[api/jobs][GET] Supabase query error", error, {
        tenantDbId,
        role,
      });
      throw new Error(error.message);
    }

    const docs = (data || []).map(serialize);

    // Track jobs_view event
    trackMarketingEvent("jobs_view", {
      tenantId: tenantDbId,
      role,
      page,
      limit,
      total: count || 0,
    });

    if (paginate) {
      const total = Number(count || 0);
      return new Response(
        JSON.stringify({
          data: docs,
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify(docs), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[api/jobs][GET] Supabase error", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}

export async function POST(request) {
  try {
    const csrfBlock = applyMutationCsrfGuard(request);
    if (csrfBlock) return csrfBlock;

    const { tenantDbId, role, userId, authenticated } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) {
      return unauthenticatedResponse();
    }

    if (!canWrite(role)) {
      return forbiddenResponse();
    }

    const body = sanitizePayloadDeep(await request.json());
    const toInsert = await attachFreshPartyToJobDbRow(
      supabaseAdmin,
      tenantDbId,
      buildInsertRow(body, tenantDbId, userId),
    );

    const { data, error } = await supabaseAdmin
      .from(JOBS)
      .insert(toInsert)
      .select("*")
      .single();

    if (error) {
      logSupabaseError("[api/jobs][POST] Supabase insert error", error, {
        tenantDbId,
        userId,
        toInsert,
      });
      throw new Error(error.message);
    }

    // --- Google Calendar integration (auto-sync) ---
    try {
      const { createGoogleCalendarEvent } = await import(
        "@/lib/google-calendar"
      );

      const hasDueDate = Boolean(String(data.due_date || "").trim());
      const parsedDueDate = hasDueDate ? new Date(data.due_date) : new Date();
      const safeStart = Number.isNaN(parsedDueDate.getTime())
        ? new Date()
        : parsedDueDate;
      const safeEnd = new Date(safeStart.getTime() + 60 * 60 * 1000);

      await createGoogleCalendarEvent({
        userId,
        tenantId: tenantDbId,
        summary: `Job - ${data.title}`,
        location: data.client_name || "",
        description: [
          data.description ? `Description: ${data.description}` : "",
          data.service ? `Service: ${data.service}` : "",
          data.client_name ? `Client: ${data.client_name}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
        start: { dateTime: safeStart.toISOString() },
        end: { dateTime: safeEnd.toISOString() },
      });
    } catch (err) {
      console.warn("[jobs] Google Calendar integration skipped", err?.message);
    }

    // Track jobs_create event
    trackMarketingEvent("jobs_create", {
      tenantId: tenantDbId,
      userId,
      jobId: data.id,
      title: data.title,
      status: data.status,
    });

    return new Response(
      JSON.stringify({ success: true, data: serialize(data) }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("[api/jobs][POST] Supabase error", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
