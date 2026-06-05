/**
 * Shared client billing + job-site party data for invoices, estimates, and jobs.
 * Reuses invoice-party resolution (by client id or exact name).
 */

import {
  buildInvoicePartyDbFields,
  resolveClientForInvoiceParty,
} from "./invoice-party.js";
import { parseEstimateNotes, stringifyEstimateNotes } from "./estimate-notes.js";

function toText(value) {
  return String(value ?? "").trim();
}

export function partyFieldsFromClient(client = {}, overrides = {}) {
  return buildInvoicePartyDbFields(client, overrides);
}

export async function enrichEstimateWithPartyInfo(
  supabase,
  tenantId,
  estimate = {},
) {
  const client = await resolveClientForInvoiceParty(supabase, tenantId, {
    clientId: estimate.clientId || estimate.clientUuid,
    clientName: estimate.clientName,
    clientEmail: estimate.clientEmail,
  });

  return enrichEstimateWithClientRow(estimate, client);
}

export function enrichEstimateWithClientRow(estimate = {}, client = null) {
  if (!client) return estimate;

  const party = partyFieldsFromClient(client, {
    clientEmail: estimate.clientEmail,
  });

  const projectAddress =
    toText(estimate.address) || party.property_address;
  const billingAddress = party.client_address;

  return {
    ...estimate,
    clientId: toText(estimate.clientId || estimate.clientUuid) || client.id,
    clientUuid: toText(estimate.clientUuid) || client.id,
    clientEmail: party.client_email || estimate.clientEmail,
    clientPhone: party.client_phone || estimate.clientPhone,
    address: projectAddress,
    billingAddress,
    propertyAddress: party.property_address,
  };
}

/** Batch client lookup for estimate lists — avoids N+1 per row. */
export async function enrichEstimatesWithPartyBatch(
  supabase,
  tenantId,
  estimates = [],
) {
  if (!Array.isArray(estimates) || !estimates.length) return estimates;

  const clientIds = [
    ...new Set(
      estimates
        .map((row) => toText(row.clientId || row.clientUuid))
        .filter(Boolean),
    ),
  ];

  const clientMap = new Map();
  if (clientIds.length && supabase && tenantId) {
    const { data, error } = await supabase
      .from("clients")
      .select(
        "id, tenant_id, name, email, phone, address, city, state, zip_code, billing_address, billing_city, billing_state, billing_zip, billing_same_as_service",
      )
      .eq("tenant_id", tenantId)
      .in("id", clientIds);
    if (error) throw new Error(error.message);
    for (const row of data || []) {
      if (row?.id) clientMap.set(row.id, row);
    }
  }

  const results = [];
  for (const estimate of estimates) {
    const id = toText(estimate.clientId || estimate.clientUuid);
    let client = id ? clientMap.get(id) : null;
    if (!client && toText(estimate.clientName)) {
      client = await resolveClientForInvoiceParty(supabase, tenantId, {
        clientName: estimate.clientName,
        clientEmail: estimate.clientEmail,
      });
    }
    results.push(enrichEstimateWithClientRow(estimate, client));
  }
  return results;
}

export async function enrichJobWithPartyInfo(supabase, tenantId, job = {}) {
  const client = await resolveClientForInvoiceParty(supabase, tenantId, {
    clientId: job.clientId,
    clientName: job.clientName,
    clientEmail: job.clientEmail,
  });

  if (!client) return job;

  const party = partyFieldsFromClient(client, {
    clientEmail: job.clientEmail,
  });

  return {
    ...job,
    clientId: toText(job.clientId) || client.id,
    clientName: toText(job.clientName) || client.name,
    clientEmail: party.client_email || job.clientEmail,
    clientPhone: party.client_phone || job.clientPhone,
    billingAddress: party.client_address,
    propertyAddress: party.property_address,
  };
}

/** Merge client addresses into estimates.notes JSON before insert/update. */
export async function attachFreshPartyToEstimateDbRow(
  supabase,
  tenantId,
  row = {},
) {
  const parsed = parseEstimateNotes(row.notes);
  const client = await resolveClientForInvoiceParty(supabase, tenantId, {
    clientId: row.client_id || parsed.clientUuid,
    clientName: row.client_name,
    clientEmail: parsed.clientEmail,
  });

  if (!client) return row;

  const party = partyFieldsFromClient(client, {
    clientEmail: parsed.clientEmail,
  });

  return {
    ...row,
    client_id: toText(row.client_id) || client.id,
    notes: stringifyEstimateNotes({
      address: toText(parsed.address) || party.property_address,
      noteText: parsed.noteText,
      serviceTitle: parsed.serviceTitle,
      clientUuid: toText(parsed.clientUuid) || client.id,
      clientEmail: toText(parsed.clientEmail) || party.client_email,
      clientPhone: toText(parsed.clientPhone) || party.client_phone,
      requestedItems: parsed.requestedItems,
      audit: parsed.audit,
    }),
  };
}

/** Link job row to saved client when only the name was provided. */
export async function attachFreshPartyToJobDbRow(
  supabase,
  tenantId,
  row = {},
) {
  const client = await resolveClientForInvoiceParty(supabase, tenantId, {
    clientId: row.client_id,
    clientName: row.client_name,
  });

  if (!client) return row;

  return {
    ...row,
    client_id: toText(row.client_id) || client.id,
    client_name: toText(row.client_name) || client.name,
  };
}

export async function hydrateEstimateRowsParty(supabase, tenantId, rows = []) {
  if (!Array.isArray(rows) || !rows.length) return rows || [];

  const out = [];
  for (const row of rows) {
    const parsed = parseEstimateNotes(row.notes);
    const needsParty =
      !toText(parsed.address) ||
      !toText(parsed.clientEmail) ||
      !toText(parsed.clientPhone) ||
      !toText(row.client_id);

    if (!needsParty || !toText(row.client_name)) {
      out.push(row);
      continue;
    }

    out.push(await attachFreshPartyToEstimateDbRow(supabase, tenantId, { ...row }));
  }
  return out;
}
