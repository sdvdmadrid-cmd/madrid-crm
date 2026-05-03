import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";

function serializeLead(row) {
  return {
    id: row.id,
    source: "website_lead",
    status: row.status || "new",
    createdAt: row.created_at || null,
    tenantId: row.tenant_id,
    name: row.name || "",
    email: row.email || "",
    phone: row.phone || "",
    serviceNeeded: row.service_needed || "",
    photoDataUrl: row.photo_data_url || "",
    address: [row.address_line_1, row.city, row.state, row.zip_code]
      .filter(Boolean)
      .join(", "),
    description: [
      row.service_needed ? `Service: ${row.service_needed}` : "",
      row.description || "",
      row.photo_data_url ? "Photo attached" : "",
    ]
      .filter(Boolean)
      .join("\n"),
    raw: row,
  };
}

function serializeEstimateRequest(row) {
  return {
    id: row.id,
    source: "estimate_request",
    status: row.status || "new",
    createdAt: row.created_at || null,
    tenantId: row.tenant_id,
    name: row.contact_name || row.client_name || "",
    email: row.contact_email || "",
    phone: row.contact_phone || "",
    address: "",
    description: row.message || "",
    requestType: row.request_type || "",
    raw: row,
  };
}

export async function GET(request) {
  try {
    const { tenantDbId, role, authenticated } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) return unauthenticatedResponse();

    let leadsQuery = supabaseAdmin
      .from("contractor_website_leads")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    let requestsQuery = supabaseAdmin
      .from("estimate_requests")
      .select("*")
      .or("request_type.eq.new_estimate,item.eq.website_quote_request")
      .order("created_at", { ascending: false })
      .limit(50);

    if ((role || "").toLowerCase() !== "super_admin") {
      leadsQuery = leadsQuery.eq("tenant_id", tenantDbId);
      requestsQuery = requestsQuery.eq("tenant_id", tenantDbId);
    }

    const [leadsResult, requestsResult] = await Promise.allSettled([leadsQuery, requestsQuery]);

    const leads = leadsResult.status === "fulfilled" ? leadsResult.value?.data || [] : [];
    const requests = requestsResult.status === "fulfilled" ? requestsResult.value?.data || [] : [];

    if (leadsResult.status === "rejected") {
      console.error("[api/lead-inbox][GET] leads query failed", leadsResult.reason);
    }
    if (requestsResult.status === "rejected") {
      console.error("[api/lead-inbox][GET] requests query failed", requestsResult.reason);
    }

    // Also log Supabase-level errors (fulfilled but with error field)
    if (leadsResult.value?.error) console.error("[api/lead-inbox][GET] leadsError", leadsResult.value.error);
    if (requestsResult.value?.error) console.error("[api/lead-inbox][GET] requestsError", requestsResult.value.error);

    const merged = [
      ...(leads).map(serializeLead),
      ...(requests).map(serializeEstimateRequest),
    ]
      .sort((a, b) => {
        const aa = new Date(a.createdAt || 0).getTime();
        const bb = new Date(b.createdAt || 0).getTime();
        return bb - aa;
      })
      .slice(0, 300);

    return Response.json({ success: true, data: merged });
  } catch (error) {
    console.error("[api/lead-inbox][GET] error", error);
    return Response.json(
      { success: false, error: "Unable to load lead inbox" },
      { status: 500 },
    );
  }
}
