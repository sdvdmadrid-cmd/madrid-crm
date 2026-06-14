import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  getAuthenticatedTenantContext,
  getSubscriptionBlockedResponse,
  unauthenticatedResponse,
} from "@/lib/tenant";
import { scopeByTenant } from "@/lib/tenant-scope";
import { isSuperAdminRole } from "@/lib/access-control";

function serializeLead(row) {
  const photoUrl =
    String(row.photo_url || "").trim() ||
    (String(row.photo_data_url || "").startsWith("data:image/")
      ? row.photo_data_url
      : "");
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
    budgetRange: row.budget_range || row.metadata?.budgetRange || "",
    timeline: row.timeline || row.metadata?.timeline || "",
    contactPreference: row.contact_preference || row.metadata?.contactPreference || "",
    photoUrl,
    photoDataUrl: row.photo_data_url || "",
    address: [row.address_line_1, row.city, row.state, row.zip_code]
      .filter(Boolean)
      .join(", "),
    description: row.description || "",
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
    const context = await getAuthenticatedTenantContext(request);
    const subscriptionBlocked = getSubscriptionBlockedResponse(context);
    if (subscriptionBlocked) return subscriptionBlocked;
    const { tenantDbId, role, authenticated  } = context;
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

    if (!isSuperAdminRole(role)) {
      leadsQuery = scopeByTenant(leadsQuery, { tenantDbId, role });
      requestsQuery = scopeByTenant(requestsQuery, { tenantDbId, role });
    }

    const [leadsResult, requestsResult] = await Promise.allSettled([leadsQuery, requestsQuery]);

    const leads = leadsResult.status === "fulfilled" ? leadsResult.value?.data || [] : [];
    const requestsRaw =
      requestsResult.status === "fulfilled" ? requestsResult.value?.data || [] : [];
    // Website form already creates contractor_website_leads — hide duplicate queue rows.
    const requests = requestsRaw.filter((row) => row?.item !== "website_quote_request");

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
