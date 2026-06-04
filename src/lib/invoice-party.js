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

export async function fetchInvoicePartyDbFields(
  supabase,
  tenantId,
  clientId,
  overrides = {},
) {
  const client = await loadClientRowForInvoiceParty(supabase, tenantId, clientId);
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

export async function enrichInvoiceWithPartyInfo(supabase, tenantId, invoice = {}) {
  const party = resolveInvoicePartyDisplay(invoice);
  if (party.hasCustomerAddress || party.hasPropertyAddress) {
    return { ...invoice, ...invoicePartyFieldsFromDoc(invoice) };
  }

  const clientId = toText(invoice.clientId || invoice.client_id);
  if (!clientId) return invoice;

  const client = await loadClientRowForInvoiceParty(supabase, tenantId, clientId);
  if (!client) return invoice;

  const dbFields = buildInvoicePartyDbFields(client, {
    clientEmail: invoice.clientEmail || invoice.client_email,
  });

  return {
    ...invoice,
    clientPhone: dbFields.client_phone,
    clientAddress: dbFields.client_address,
    propertyAddress: dbFields.property_address,
    clientEmail: dbFields.client_email || invoice.clientEmail,
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
