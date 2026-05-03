import { sanitizePayloadDeep } from "@/lib/input-sanitizer";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  canWrite,
  forbiddenResponse,
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";

function clean(value, max = 200) {
  return String(value || "").trim().slice(0, max);
}

async function findClient(tenantId, email, phone) {
  if (email) {
    const { data } = await supabaseAdmin
      .from("clients")
      .select("id, name")
      .eq("tenant_id", tenantId)
      .eq("email", email)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return data;
  }

  if (phone) {
    const { data } = await supabaseAdmin
      .from("clients")
      .select("id, name")
      .eq("tenant_id", tenantId)
      .eq("phone", phone)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return data;
  }

  return null;
}

export async function POST(request) {
  try {
    const { tenantDbId, role, userId, authenticated } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) return unauthenticatedResponse();
    if (!canWrite(role)) return forbiddenResponse();

    const body = sanitizePayloadDeep(await request.json());
    const leadId = clean(body.leadId, 64);
    const requestId = clean(body.requestId, 64);
    const source = clean(body.source, 40);
    const target = clean(body.target || "estimate", 20).toLowerCase();

    if (!leadId && !requestId) {
      return Response.json(
        { success: false, error: "leadId or requestId is required" },
        { status: 400 },
      );
    }

    const nowIso = new Date().toISOString();

    let record = null;
    if (source === "website_lead" || leadId) {
      const { data } = await supabaseAdmin
        .from("contractor_website_leads")
        .select("*")
        .eq("id", leadId)
        .eq("tenant_id", tenantDbId)
        .maybeSingle();
      record = data;
    }

    if (!record && (source === "estimate_request" || requestId)) {
      const { data } = await supabaseAdmin
        .from("estimate_requests")
        .select("*")
        .eq("id", requestId)
        .eq("tenant_id", tenantDbId)
        .maybeSingle();
      record = data
        ? {
            tenant_id: data.tenant_id,
            name: data.contact_name || data.client_name || "",
            email: data.contact_email || "",
            phone: data.contact_phone || "",
            address_line_1: "",
            city: "",
            state: "",
            zip_code: "",
            description: data.message || "",
            _request_id: data.id,
          }
        : null;
    }

    if (!record) {
      return Response.json(
        { success: false, error: "Lead/request not found" },
        { status: 404 },
      );
    }

    const name = clean(record.name, 200);
    const email = clean(record.email, 200);
    const phone = clean(record.phone, 20);
    const address = [
      clean(record.address_line_1, 200),
      clean(record.city, 120),
      clean(record.state, 40),
      clean(record.zip_code, 20),
    ]
      .filter(Boolean)
      .join(", ");
    const description = clean(record.description, 2000);
    const serviceNeeded = clean(record.service_needed || body.service || "Website service request", 160);

    let client = await findClient(tenantDbId, email, phone);
    if (!client) {
      const { data: insertedClient, error: clientError } = await supabaseAdmin
        .from("clients")
        .insert({
          tenant_id: tenantDbId,
          user_id: userId || null,
          created_by: userId || null,
          name: name || "Website lead",
          email,
          phone,
          address,
          notes: `Converted from lead inbox\n${description}`,
          lead_status: "contacted",
          estimate_sent: false,
          created_at: nowIso,
          updated_at: nowIso,
        })
        .select("id, name")
        .single();
      if (clientError) throw new Error(clientError.message);
      client = insertedClient;
    }

    let job = null;
    let estimate = null;

    if (target === "job") {
      const { data: insertedJob, error: jobError } = await supabaseAdmin
        .from("jobs")
        .insert({
          tenant_id: tenantDbId,
          user_id: userId || null,
          created_by: userId || null,
          title: clean(body.title, 160) || `Website lead - ${name || "New client"}`,
          description: description,
          client_id: client.id,
          client_name: client.name || name,
          service: clean(body.service, 120) || serviceNeeded,
          status: "Pending",
          price: "",
          due_date: "",
          tax_state: clean(record.state, 40),
          down_payment_percent: "0",
          scope_details: description,
          square_meters: "",
          complexity: "standard",
          materials_included: true,
          travel_minutes: "",
          urgency: "flexible",
          estimate_snapshot: null,
          invoiced: false,
          created_at: nowIso,
          updated_at: nowIso,
        })
        .select("id, title, client_id, client_name, created_at")
        .single();

      if (jobError) throw new Error("Unable to save job");
      job = insertedJob;
    } else {
      const estimateLines = [
        {
          description: serviceNeeded,
          quantity: 1,
          unitPrice: 0,
          total: 0,
        },
      ];

      const { data: insertedEstimate, error: estimateError } = await supabaseAdmin
        .from("estimate_builder")
        .insert({
          tenant_id: tenantDbId,
          user_id: userId || null,
          created_by: userId || null,
          name: clean(body.title, 160) || `Lead estimate - ${name || "New client"}`,
          description: description,
          notes: `Converted from lead inbox\nService needed: ${serviceNeeded}`,
          lines: estimateLines,
          total_low: 0,
          total_high: 0,
          total_mid: 0,
          total_final: 0,
          client_id: client.id,
          "clientId": client.id,
          created_at: nowIso,
          updated_at: nowIso,
        })
        .select("id, name, client_id")
        .single();

      if (estimateError) throw new Error("Unable to save estimate");
      estimate = insertedEstimate;
    }

    if (leadId) {
      await supabaseAdmin
        .from("contractor_website_leads")
        .update({ status: "converted", updated_at: nowIso })
        .eq("id", leadId)
        .eq("tenant_id", tenantDbId);
    }

    const effectiveRequestId = requestId || record._request_id;
    if (effectiveRequestId) {
      await supabaseAdmin
        .from("estimate_requests")
        .update({ status: "resolved", updated_at: nowIso })
        .eq("id", effectiveRequestId)
        .eq("tenant_id", tenantDbId);
    }

    return Response.json({
      success: true,
      data: {
        target,
        estimateId: estimate?.id || null,
        estimateTitle: estimate?.name || null,
        jobId: job?.id || null,
        jobTitle: job?.title || null,
        clientId: client.id,
      },
    });
  } catch (error) {
    console.error("[api/lead-inbox/convert][POST] error", error);
    return Response.json(
      { success: false, error: "Failed to convert lead" },
      { status: 500 },
    );
  }
}
