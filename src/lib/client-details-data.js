import "server-only";

import { CLIENT_SELECT_COLUMNS, serializeClient } from "@/lib/client-records";
import { supabaseAdmin } from "@/lib/supabase-admin";

async function safeSelect(builder, label) {
  const { data, error } = await builder;
  if (error) {
    console.error(`[client-details] ${label} query error`, error);
    return { rows: [], error: error.message };
  }
  return { rows: data || [], error: null };
}

function serializeEstimate(row = {}) {
  return {
    id: row.id,
    name: row.name || "",
    estimateNumber: row.estimate_number || "",
    quoteId: row.quote_id || null,
    total: Number(row.total_final ?? row.total_mid ?? 0),
    updatedAt: row.updated_at || null,
    createdAt: row.created_at || null,
  };
}

function serializeQuote(row = {}) {
  return {
    id: row.id,
    quoteNumber: row.quote_number || "",
    title: row.title || "",
    status: row.status || "",
    estimateId: row.estimate_id || null,
    updatedAt: row.updated_at || null,
    createdAt: row.created_at || null,
  };
}

function serializeInvoice(row = {}) {
  const amount = Number(
    row.amount ?? (Number(row.total_cents || 0) / 100 || 0),
  );
  return {
    id: row.id,
    invoiceNumber: row.invoice_number || "",
    invoiceTitle: row.invoice_title || "",
    quoteNumber: row.quote_number || "",
    amount: amount ? String(amount) : "",
    status: row.status || "Unpaid",
    dueDate: row.due_date ? String(row.due_date).slice(0, 10) : "",
    updatedAt: row.updated_at || null,
    createdAt: row.created_at || null,
  };
}

function serializeJob(row = {}) {
  return {
    id: row.id,
    title: row.title || row.service || "",
    status: row.status || "",
    service: row.service || "",
    dueDate: row.due_date || "",
    updatedAt: row.updated_at || null,
    createdAt: row.created_at || null,
  };
}

function serializeProperty(row = {}) {
  return {
    id: row.id,
    label: row.label || "",
    address: row.address || "",
    city: row.city || "",
    state: row.state || "",
    zip: row.zip_code || "",
    isPrimary: Boolean(row.is_primary),
  };
}

function serializeNote(row = {}) {
  return {
    id: row.id,
    body: row.body || "",
    source: row.source || "",
    createdAt: row.created_at || null,
  };
}

function serializeVisit(row = {}) {
  return {
    id: row.id,
    title: row.title || "",
    status: row.status || "",
    startAt: row.start_at || null,
    endAt: row.end_at || null,
    completedAt: row.completed_at || null,
    instructions: row.instructions || "",
  };
}

function serializeRequest(row = {}) {
  return {
    id: row.id,
    title: row.title || "",
    status: row.status || "",
    details: row.details || "",
    createdAt: row.created_at || null,
  };
}

/**
 * Load full client profile and all linked CRM records for the details panel.
 */
export async function loadClientDetailsBundle({
  clientId,
  tenantDbId,
  isSuperAdmin = false,
}) {
  const warnings = [];

  let clientQuery = supabaseAdmin
    .from("clients")
    .select(CLIENT_SELECT_COLUMNS)
    .eq("id", clientId);
  if (!isSuperAdmin) {
    clientQuery = clientQuery.eq("tenant_id", tenantDbId);
  }

  const { data: clientRow, error: clientError } =
    await clientQuery.maybeSingle();
  if (clientError) throw new Error(clientError.message);
  if (!clientRow) return null;

  const scope = (query) => {
    if (!isSuperAdmin) return query.eq("tenant_id", tenantDbId);
    return query;
  };

  const scopeQuotes = (query) => {
    if (!isSuperAdmin) return query.eq("tenant_id", String(tenantDbId));
    return query;
  };

  const [
    estimatesResult,
    quotesResult,
    invoicesResult,
    jobsResult,
    propertiesResult,
    notesResult,
    visitsResult,
    requestsResult,
  ] = await Promise.all([
    safeSelect(
      scope(
        supabaseAdmin
          .from("estimate_builder")
          .select(
            "id, name, estimate_number, quote_id, total_final, total_mid, updated_at, created_at",
          )
          .eq("client_id", clientId)
          .order("updated_at", { ascending: false })
          .limit(50),
      ),
      "estimates",
    ),
    safeSelect(
      scopeQuotes(
        supabaseAdmin
          .from("quotes")
          .select(
            "id, quote_number, title, status, updated_at, created_at",
          )
          .eq("client_id", clientId)
          .order("updated_at", { ascending: false })
          .limit(50),
      ),
      "quotes",
    ),
    safeSelect(
      scope(
        supabaseAdmin
          .from("invoices")
          .select(
            "id, invoice_number, invoice_title, quote_number, amount, total_cents, status, due_date, updated_at, created_at",
          )
          .eq("client_id", clientId)
          .order("updated_at", { ascending: false })
          .limit(50),
      ),
      "invoices",
    ),
    safeSelect(
      scope(
        supabaseAdmin
          .from("jobs")
          .select("id, title, service, status, due_date, updated_at, created_at")
          .eq("client_id", clientId)
          .order("updated_at", { ascending: false })
          .limit(50),
      ),
      "jobs",
    ),
    safeSelect(
      scope(
        supabaseAdmin
          .from("client_properties")
          .select("id, label, address, city, state, zip_code, is_primary")
          .eq("client_id", clientId)
          .order("is_primary", { ascending: false })
          .limit(25),
      ),
      "properties",
    ),
    safeSelect(
      scope(
        supabaseAdmin
          .from("client_notes")
          .select("id, body, source, created_at")
          .eq("client_id", clientId)
          .order("created_at", { ascending: false })
          .limit(100),
      ),
      "notes",
    ),
    safeSelect(
      scope(
        supabaseAdmin
          .from("client_visits")
          .select(
            "id, title, status, start_at, end_at, completed_at, instructions",
          )
          .eq("client_id", clientId)
          .order("start_at", { ascending: false })
          .limit(50),
      ),
      "visits",
    ),
    safeSelect(
      scope(
        supabaseAdmin
          .from("client_requests")
          .select("id, title, status, details, created_at")
          .eq("client_id", clientId)
          .order("created_at", { ascending: false })
          .limit(50),
      ),
      "requests",
    ),
  ]);

  const sectionLabels = {
    estimates: "estimates",
    quotes: "quotes",
    invoices: "invoices",
    jobs: "jobs",
    properties: "properties",
    notes: "notes",
    visits: "visits",
    requests: "requests",
  };

  const sectionResults = [
    ["estimates", estimatesResult],
    ["quotes", quotesResult],
    ["invoices", invoicesResult],
    ["jobs", jobsResult],
    ["properties", propertiesResult],
    ["notes", notesResult],
    ["visits", visitsResult],
    ["requests", requestsResult],
  ];

  for (const [key, result] of sectionResults) {
    if (result.error) {
      warnings.push(`Some ${sectionLabels[key] || key} could not be loaded.`);
    }
  }

  return {
    client: serializeClient(clientRow),
    estimates: estimatesResult.rows.map(serializeEstimate),
    quotes: quotesResult.rows.map(serializeQuote),
    invoices: invoicesResult.rows.map(serializeInvoice),
    jobs: jobsResult.rows.map(serializeJob),
    properties: propertiesResult.rows.map(serializeProperty),
    notes: notesResult.rows.map(serializeNote),
    visits: visitsResult.rows.map(serializeVisit),
    requests: requestsResult.rows.map(serializeRequest),
    warnings,
  };
}
