import { supabaseAdmin } from "../supabase-admin-core.js";
import { findExistingClientToLink } from "./client-match.js";
import { jobberNoteText } from "./note-text.js";
import { paginateJobberConnectionWithFallback } from "./graphql.js";
import {
  mapJobberClientRow,
  mapJobberInvoiceRow,
  mapJobberJobRow,
  mapJobberNoteRows,
  mapJobberPropertyRows,
  mapJobberQuoteRow,
  mapJobberRequestRow,
  mapJobberVisitRow,
} from "./mappers.js";
import { getValidJobberAccessToken } from "./oauth.js";
import {
  JOBBER_CLIENTS_QUERY,
  JOBBER_CLIENTS_QUERY_LITE,
  JOBBER_INVOICES_QUERY,
  JOBBER_JOBS_QUERY,
  JOBBER_QUOTES_QUERY,
  JOBBER_REQUESTS_QUERY,
  JOBBER_VISITS_QUERY,
} from "./queries.js";

function stripCreatedAt(row = {}) {
  const { created_at: _createdAt, ...rest } = row;
  return rest;
}

async function upsertByJobberId(table, tenantId, jobberId, row, select = "id") {
  const tenantFilter =
    table === "quotes" ? String(tenantId) : tenantId;

  const { data: existing } = await supabaseAdmin
    .from(table)
    .select(select)
    .eq("tenant_id", tenantFilter)
    .eq("jobber_id", jobberId)
    .maybeSingle();

  if (existing?.id) {
    const { data, error } = await supabaseAdmin
      .from(table)
      .update({
        ...stripCreatedAt(row),
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .select(select)
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  const { data, error } = await supabaseAdmin
    .from(table)
    .insert(row)
    .select(select)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

/**
 * @returns {{ clientId: string, properties: number, notes: number } | null}
 */
async function upsertClientFromJobber(node, { tenantId, userId }) {
  const row = mapJobberClientRow(node, { tenantId, userId });
  if (!row.jobber_id) return null;

  let client = null;
  const { data: existingByJobber } = await supabaseAdmin
    .from("clients")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("jobber_id", row.jobber_id)
    .maybeSingle();

  const updateBody = stripCreatedAt(row);

  if (existingByJobber?.id) {
    const { data, error } = await supabaseAdmin
      .from("clients")
      .update({ ...updateBody, updated_at: new Date().toISOString() })
      .eq("id", existingByJobber.id)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    client = data;
  } else {
    const linked = await findExistingClientToLink(row, tenantId);
    if (linked?.id) {
      const { data, error } = await supabaseAdmin
        .from("clients")
        .update({ ...updateBody, updated_at: new Date().toISOString() })
        .eq("id", linked.id)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      client = data;
    } else {
      client = await upsertByJobberId("clients", tenantId, row.jobber_id, row);
    }
  }

  const clientId = client?.id;
  if (!clientId) return null;

  let propertiesCount = 0;
  let notesCount = 0;

  const properties = node.clientProperties?.nodes || [];
  const notes = node.clientNotes?.nodes || [];

  for (const propertyRow of mapJobberPropertyRows(properties, {
    tenantId,
    clientId,
  })) {
    if (!propertyRow.jobber_id) continue;
    await upsertByJobberId(
      "client_properties",
      tenantId,
      propertyRow.jobber_id,
      propertyRow,
    );
    propertiesCount += 1;
  }

  if (notes.length) {
    const combinedNotes = notes
      .map((note) => jobberNoteText(note))
      .filter(Boolean)
      .join("\n\n");

    if (combinedNotes) {
      await supabaseAdmin
        .from("clients")
        .update({ notes: combinedNotes, updated_at: new Date().toISOString() })
        .eq("id", clientId);
    }

    for (const noteRow of mapJobberNoteRows(notes, { tenantId, clientId })) {
      if (!noteRow.jobber_id) continue;
      await upsertByJobberId("client_notes", tenantId, noteRow.jobber_id, noteRow);
      notesCount += 1;
    }
  }

  return { clientId, properties: propertiesCount, notes: notesCount };
}

function cacheClientRow(clientCache, jobberNodeId, row, clientId) {
  clientCache.set(jobberNodeId, {
    id: clientId,
    name: row.name || "",
    email: row.email || "",
    phone: row.phone || "",
    address: row.address || "",
    city: row.city || "",
    state: row.state || "",
    zip_code: row.zip_code || "",
  });
}

/**
 * Full Jobber → FieldBase sync for a tenant workspace.
 */
export async function runJobberFullSync({ tenantId, userId }) {
  const accessToken = await getValidJobberAccessToken(tenantId);
  const summary = {
    clients: 0,
    properties: 0,
    notes: 0,
    jobs: 0,
    quotes: 0,
    invoices: 0,
    requests: 0,
    visits: 0,
    errors: [],
  };

  const clientCache = new Map();
  const jobCache = new Map();

  async function loadClient(jobberClientId) {
    if (!jobberClientId) return null;
    if (clientCache.has(jobberClientId)) return clientCache.get(jobberClientId);

    const { data } = await supabaseAdmin
      .from("clients")
      .select("id, name, email, phone, address, city, state, zip_code")
      .eq("tenant_id", tenantId)
      .eq("jobber_id", jobberClientId)
      .maybeSingle();

    clientCache.set(jobberClientId, data || null);
    return data || null;
  }

  try {
    await paginateJobberConnectionWithFallback({
      accessToken,
      connectionPath: "clients",
      queries: [JOBBER_CLIENTS_QUERY, JOBBER_CLIENTS_QUERY_LITE],
      onPage: async (nodes) => {
        for (const node of nodes) {
          try {
            const mapped = mapJobberClientRow(node, { tenantId, userId });
            const result = await upsertClientFromJobber(node, { tenantId, userId });
            if (result?.clientId) {
              summary.clients += 1;
              summary.properties += result.properties || 0;
              summary.notes += result.notes || 0;
              cacheClientRow(clientCache, node.id, mapped, result.clientId);
            }
          } catch (err) {
            summary.errors.push(`Client ${node.id}: ${err.message}`);
          }
        }
      },
    });
  } catch (err) {
    summary.errors.push(`Clients page: ${err.message}`);
  }

  try {
    await paginateJobberConnectionWithFallback({
      accessToken,
      connectionPath: "jobs",
      queries: [JOBBER_JOBS_QUERY],
      onPage: async (nodes) => {
        for (const node of nodes) {
          try {
            const jobberClientId = node.client?.id;
            const clientRow = await loadClient(jobberClientId);
            if (!clientRow?.id) continue;

            const row = mapJobberJobRow(node, {
              tenantId,
              userId,
              clientId: clientRow.id,
            });
            row.client_name = clientRow.name || "";
            if (!row.jobber_id) continue;

            const job = await upsertByJobberId("jobs", tenantId, row.jobber_id, row);
            if (job?.id) {
              summary.jobs += 1;
              jobCache.set(node.id, job.id);
            }
          } catch (err) {
            summary.errors.push(`Job ${node.id}: ${err.message}`);
          }
        }
      },
    });
  } catch (err) {
    summary.errors.push(`Jobs page: ${err.message}`);
  }

  try {
    await paginateJobberConnectionWithFallback({
      accessToken,
      connectionPath: "quotes",
      queries: [JOBBER_QUOTES_QUERY],
      onPage: async (nodes) => {
        for (const node of nodes) {
          try {
            const clientRow = await loadClient(node.client?.id);
            if (!clientRow?.id) continue;

            const row = mapJobberQuoteRow(node, {
              tenantId,
              userId,
              clientId: clientRow.id,
              clientRow,
            });
            if (!row.jobber_id) continue;

            const quote = await upsertByJobberId("quotes", tenantId, row.jobber_id, row);
            summary.quotes += 1;

            if (quote?.id) {
              const estimateMirrorId = `jobber-quote:${row.jobber_id}`;
              const estimateTotal = Array.isArray(row.line_items)
                ? row.line_items.reduce(
                    (sum, item) => sum + Number(item.total || 0),
                    0,
                  )
                : 0;

              await upsertByJobberId(
                "estimate_builder",
                tenantId,
                estimateMirrorId,
                {
                  tenant_id: tenantId,
                  user_id: userId || null,
                  created_by: userId || null,
                  client_id: String(clientRow.id),
                  name: row.title || "Estimate",
                  estimate_number: row.quote_number
                    ? `EST-${row.quote_number}`
                    : "",
                  quote_id: quote.id,
                  lines: row.line_items || [],
                  notes: row.scope_of_work || "",
                  total_final: estimateTotal,
                  jobber_id: estimateMirrorId,
                  updated_at: new Date().toISOString(),
                  created_at: new Date().toISOString(),
                },
              );
            }
          } catch (err) {
            summary.errors.push(`Quote ${node.id}: ${err.message}`);
          }
        }
      },
    });
  } catch (err) {
    summary.errors.push(`Quotes page: ${err.message}`);
  }

  try {
    await paginateJobberConnectionWithFallback({
      accessToken,
      connectionPath: "invoices",
      queries: [JOBBER_INVOICES_QUERY],
      onPage: async (nodes) => {
        for (const node of nodes) {
          try {
            const clientRow = await loadClient(node.client?.id);
            if (!clientRow?.id) continue;

            const row = mapJobberInvoiceRow(node, {
              tenantId,
              userId,
              clientId: clientRow.id,
              clientRow,
            });
            if (!row.jobber_id) continue;

            await upsertByJobberId("invoices", tenantId, row.jobber_id, row);
            summary.invoices += 1;
          } catch (err) {
            summary.errors.push(`Invoice ${node.id}: ${err.message}`);
          }
        }
      },
    });
  } catch (err) {
    summary.errors.push(`Invoices page: ${err.message}`);
  }

  try {
    await paginateJobberConnectionWithFallback({
      accessToken,
      connectionPath: "requests",
      queries: [JOBBER_REQUESTS_QUERY],
      onPage: async (nodes) => {
        for (const node of nodes) {
          try {
            const clientRow = await loadClient(node.client?.id);
            if (!clientRow?.id) continue;

            const row = mapJobberRequestRow(node, {
              tenantId,
              clientId: clientRow.id,
            });
            if (!row.jobber_id) continue;

            await upsertByJobberId("client_requests", tenantId, row.jobber_id, row);
            summary.requests += 1;
          } catch (err) {
            summary.errors.push(`Request ${node.id}: ${err.message}`);
          }
        }
      },
    });
  } catch (err) {
    summary.errors.push(`Requests page: ${err.message}`);
  }

  try {
    await paginateJobberConnectionWithFallback({
      accessToken,
      connectionPath: "visits",
      queries: [JOBBER_VISITS_QUERY],
      onPage: async (nodes) => {
        for (const node of nodes) {
          try {
            const clientRow = await loadClient(node.client?.id);
            if (!clientRow?.id) continue;

            const jobId = node.job?.id ? jobCache.get(node.job.id) || null : null;
            const row = mapJobberVisitRow(node, {
              tenantId,
              clientId: clientRow.id,
              jobId,
            });
            if (!row.jobber_id) continue;

            await upsertByJobberId("client_visits", tenantId, row.jobber_id, row);
            summary.visits += 1;
          } catch (err) {
            summary.errors.push(`Visit ${node.id}: ${err.message}`);
          }
        }
      },
    });
  } catch (err) {
    summary.errors.push(`Visits page: ${err.message}`);
  }

  const { data: integration } = await supabaseAdmin
    .from("integrations")
    .select("metadata")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .eq("provider", "jobber")
    .maybeSingle();

  const priorMetadata =
    integration?.metadata && typeof integration.metadata === "object"
      ? integration.metadata
      : {};

  await supabaseAdmin
    .from("integrations")
    .update({
      metadata: {
        ...priorMetadata,
        lastSyncAt: new Date().toISOString(),
        lastSyncSummary: summary,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .eq("provider", "jobber");

  return summary;
}
