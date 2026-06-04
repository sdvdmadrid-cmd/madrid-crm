/**
 * Customer and property address helpers for invoices.
 */

const CLIENT_PARTY_SELECT = [
  "id",
  "tenant_id",
  "name",
  "email",
  "phone",
  "address",
  "city",
  "state",
  "zip_code",
  "billing_address",
  "billing_city",
  "billing_state",
  "billing_zip",
  "billing_same_as_service",
].join(", ");

function toText(value) {
  return String(value ?? "").trim();
}

export function formatAddressParts(parts = []) {
  return parts.map(toText).filter(Boolean).join(", ");
}

/** Service / job-site address from a client row or serialized client. */
export function formatClientServiceAddress(client = {}) {
  const street = toText(client.address);
  const locality = formatAddressParts([
    client.city,
    client.state,
    client.zip || client.zip_code || client.zipCode,
  ]);
  return formatAddressParts([street, locality]);
}

/** Billing / customer mailing address. */
export function formatClientBillingAddress(client = {}) {
  const sameAsService = client.billing_same_as_service !== false;
  if (sameAsService) {
    return formatClientServiceAddress(client);
  }

  const street = toText(client.billing_address || client.billingAddress);
  const locality = formatAddressParts([
    client.billing_city || client.billingCity,
    client.billing_state || client.billingState,
    client.billing_zip || client.billingZip,
  ]);
  return formatAddressParts([street, locality]);
}

export function buildInvoicePartyDbFields(client = {}, overrides = {}) {
  const emailOverride = toText(overrides.clientEmail ?? overrides.client_email);
  return {
    client_phone: toText(client.phone),
    client_email: emailOverride || toText(client.email),
    client_address: formatClientBillingAddress(client),
    property_address: formatClientServiceAddress(client),
  };
}

/** Apply latest client billing + job-site fields onto an invoice DB update/insert row. */
export function applyPartyFieldsToInvoiceRow(row = {}, client = {}, overrides = {}) {
  if (!client?.id) return row;
  const party = buildInvoicePartyDbFields(client, overrides);
  return {
    ...row,
    client_id: toText(row.client_id) || client.id,
    client_phone: party.client_phone,
    client_address: party.client_address,
    property_address: party.property_address,
    ...(party.client_email ? { client_email: party.client_email } : {}),
  };
}

export async function attachFreshPartyFieldsToInvoiceRow(
  supabase,
  tenantId,
  row = {},
  { clientId, clientName, clientEmail } = {},
) {
  const resolved = await resolveClientForInvoiceParty(supabase, tenantId, {
    clientId,
    clientName,
    clientEmail,
  });
  if (!resolved) return row;
  return applyPartyFieldsToInvoiceRow(row, resolved, { clientEmail });
}

export async function hydrateInvoiceDocsParty(supabase, tenantId, docs = []) {
  if (!Array.isArray(docs) || !docs.length) return docs || [];

  const out = [];
  for (const doc of docs) {
    const missingBilling = !toText(doc.client_address);
    const missingJobSite = !toText(doc.property_address);
    if (
      (!missingBilling && !missingJobSite) ||
      (!doc.client_id && !toText(doc.client_name))
    ) {
      out.push(doc);
      continue;
    }

    const enriched = await enrichInvoiceWithPartyInfo(supabase, tenantId, {
      clientId: doc.client_id,
      clientName: doc.client_name,
      clientEmail: doc.client_email,
      clientPhone: doc.client_phone,
      clientAddress: doc.client_address,
      propertyAddress: doc.property_address,
    });

    out.push({
      ...doc,
      client_id: enriched.clientId || doc.client_id,
      client_phone: enriched.clientPhone || doc.client_phone,
      client_address: enriched.clientAddress || doc.client_address,
      property_address: enriched.propertyAddress || doc.property_address,
      client_email: enriched.clientEmail || doc.client_email,
    });
  }
  return out;
}

export function invoicePartyFieldsFromDoc(doc = {}) {
  return {
    clientPhone: doc.client_phone || "",
    clientAddress: doc.client_address || "",
    propertyAddress: doc.property_address || "",
  };
}

export function resolveInvoicePartyDisplay(invoice = {}) {
  const clientName = toText(invoice.clientName || invoice.client_name);
  const clientEmail = toText(invoice.clientEmail || invoice.client_email);
  const clientPhone = toText(invoice.clientPhone || invoice.client_phone);
  const clientAddress = toText(invoice.clientAddress || invoice.client_address);
  const propertyAddress = toText(invoice.propertyAddress || invoice.property_address);

  return {
    clientName: clientName || "—",
    clientEmail,
    clientPhone,
    clientAddress,
    propertyAddress,
    hasCustomerAddress: Boolean(clientAddress),
    hasPropertyAddress: Boolean(propertyAddress),
    hasContact: Boolean(clientEmail || clientPhone),
  };
}

export async function loadClientRowForInvoiceParty(supabase, tenantId, clientId) {
  const id = toText(clientId);
  if (!id || !supabase) return null;

  let query = supabase
    .from("clients")
    .select(CLIENT_PARTY_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (tenantId) {
    query = query.eq("tenant_id", tenantId);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data || null;
}

/**
 * Resolve a client row for invoice party data by id, then by exact name (and email if ambiguous).
 */
export async function resolveClientForInvoiceParty(
  supabase,
  tenantId,
  { clientId, clientName, clientEmail } = {},
) {
  if (!supabase) return null;

  const byId = await loadClientRowForInvoiceParty(
    supabase,
    tenantId,
    clientId,
  );
  if (byId) return byId;

  const name = toText(clientName);
  if (!name || !tenantId) return null;

  const { data, error } = await supabase
    .from("clients")
    .select(CLIENT_PARTY_SELECT)
    .eq("tenant_id", tenantId)
    .ilike("name", name)
    .limit(8);

  if (error) throw new Error(error.message);

  const rows = Array.isArray(data) ? data : [];
  if (!rows.length) return null;
  if (rows.length === 1) return rows[0];

  const email = toText(clientEmail).toLowerCase();
  if (email) {
    const emailMatch = rows.find(
      (row) => toText(row.email).toLowerCase() === email,
    );
    if (emailMatch) return emailMatch;
  }

  return rows[0];
}

export async function fetchInvoicePartyDbFields(
  supabase,
  tenantId,
  clientId,
  overrides = {},
) {
  const client = await resolveClientForInvoiceParty(supabase, tenantId, {
    clientId,
    clientName: overrides.clientName,
    clientEmail: overrides.clientEmail,
  });
  if (!client) {
    return {
      client_phone: "",
      client_address: "",
      property_address: "",
      ...(toText(overrides.clientEmail)
        ? { client_email: toText(overrides.clientEmail) }
        : {}),
    };
  }
  return buildInvoicePartyDbFields(client, overrides);
}

/** Write resolved party fields back to the invoice row when they were missing. */
export async function persistInvoicePartySnapshot(
  supabase,
  tenantId,
  storedRow = {},
  invoice = {},
) {
  if (!supabase || !storedRow?.id) return;

  const patch = { updated_at: new Date().toISOString() };
  if (!toText(storedRow.client_id) && toText(invoice.clientId)) {
    patch.client_id = invoice.clientId;
  }
  if (!toText(storedRow.client_address) && toText(invoice.clientAddress)) {
    patch.client_address = invoice.clientAddress;
  }
  if (!toText(storedRow.property_address) && toText(invoice.propertyAddress)) {
    patch.property_address = invoice.propertyAddress;
  }
  if (!toText(storedRow.client_phone) && toText(invoice.clientPhone)) {
    patch.client_phone = invoice.clientPhone;
  }
  if (!toText(storedRow.client_email) && toText(invoice.clientEmail)) {
    patch.client_email = invoice.clientEmail;
  }

  if (Object.keys(patch).length <= 1) return;

  let query = supabase
    .from("invoices")
    .update(patch)
    .eq("id", storedRow.id);

  if (tenantId) {
    query = query.eq("tenant_id", tenantId);
  }

  const { error } = await query;
  if (error) throw new Error(error.message);
}

export async function enrichInvoiceWithPartyInfo(supabase, tenantId, invoice = {}) {
  const party = resolveInvoicePartyDisplay(invoice);
  const client = await resolveClientForInvoiceParty(supabase, tenantId, {
    clientId: invoice.clientId || invoice.client_id,
    clientName: invoice.clientName || invoice.client_name,
    clientEmail: invoice.clientEmail || invoice.client_email,
  });

  if (!client) {
    return { ...invoice, ...invoicePartyFieldsFromDoc(invoice) };
  }

  const dbFields = buildInvoicePartyDbFields(client, {
    clientEmail: invoice.clientEmail || invoice.client_email,
  });

  return {
    ...invoice,
    clientId: toText(invoice.clientId || invoice.client_id) || client.id,
    clientPhone: dbFields.client_phone || party.clientPhone,
    clientAddress: dbFields.client_address || party.clientAddress,
    propertyAddress: dbFields.property_address || party.propertyAddress,
    clientEmail:
      dbFields.client_email ||
      party.clientEmail ||
      toText(invoice.clientEmail || invoice.client_email),
  };
}

/** Shared PDF layout: Bill To (customer) | Job site (property). */
export function renderInvoicePartySection(doc, invoice, pageWidth) {
  const party = resolveInvoicePartyDisplay(invoice);
  const colGap = 24;
  const colW = (pageWidth - colGap) / 2;
  const leftX = doc.page.margins.left;
  const rightX = leftX + colW + colGap;
  const startY = doc.y;

  doc.font("Helvetica-Bold").fontSize(9).fillColor("#64748b");
  doc.text("BILL TO", leftX, startY, { width: colW });
  doc.text("JOB SITE", rightX, startY, { width: colW });

  let bodyY = startY + 14;
  doc.font("Helvetica-Bold").fontSize(11).fillColor("#0f172a");
  doc.text(party.clientName, leftX, bodyY, { width: colW });

  doc.font("Helvetica").fontSize(10).fillColor("#475569");
  let leftEnd = doc.y;
  if (party.clientAddress) {
    doc.text(party.clientAddress, leftX, leftEnd, { width: colW });
    leftEnd = doc.y;
  }
  if (party.clientPhone) {
    doc.text(`Phone: ${party.clientPhone}`, leftX, leftEnd, { width: colW });
    leftEnd = doc.y;
  }
  if (party.clientEmail) {
    doc.text(`Email: ${party.clientEmail}`, leftX, leftEnd, { width: colW });
    leftEnd = doc.y;
  }

  bodyY = startY + 14;
  if (party.propertyAddress) {
    doc.font("Helvetica").fontSize(10).fillColor("#475569");
    doc.text(party.propertyAddress, rightX, bodyY, { width: colW });
  } else {
    doc.font("Helvetica").fontSize(10).fillColor("#94a3b8");
    doc.text("—", rightX, bodyY, { width: colW });
  }
  const rightEnd = doc.y;

  doc.y = Math.max(leftEnd, rightEnd) + 14;
}

export function buildInvoicePartyHtmlBlock(invoice = {}) {
  const party = resolveInvoicePartyDisplay(invoice);
  const rows = [];

  rows.push(`<p><strong>Bill to:</strong> ${escapeHtml(party.clientName)}</p>`);
  if (party.clientAddress) {
    rows.push(`<p><strong>Customer address:</strong> ${escapeHtml(party.clientAddress)}</p>`);
  }
  if (party.propertyAddress) {
    rows.push(`<p><strong>Property address:</strong> ${escapeHtml(party.propertyAddress)}</p>`);
  }
  if (party.clientPhone) {
    rows.push(`<p><strong>Phone:</strong> ${escapeHtml(party.clientPhone)}</p>`);
  }
  if (party.clientEmail) {
    rows.push(`<p><strong>Email:</strong> ${escapeHtml(party.clientEmail)}</p>`);
  }

  if (rows.length <= 1 && !party.hasContact) {
    return "";
  }

  return `<div style="margin:16px 0;padding:12px 14px;background:#f8fafc;border-radius:8px;">${rows.join("")}</div>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export { CLIENT_PARTY_SELECT };
