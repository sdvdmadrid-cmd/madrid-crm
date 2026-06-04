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
