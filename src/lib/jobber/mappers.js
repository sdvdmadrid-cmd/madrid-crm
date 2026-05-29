function pickPrimary(items, primaryKey = "primary") {
  if (!Array.isArray(items) || !items.length) return null;
  return items.find((item) => item?.[primaryKey]) || items[0];
}

function formatAddress(address = {}) {
  const street = [address.street1, address.street2].filter(Boolean).join(", ");
  const locality = [address.city, address.province, address.postalCode]
    .filter(Boolean)
    .join(" ");
  return [street, locality].filter(Boolean).join(", ");
}

export function mapJobberClientRow(node = {}, { tenantId, userId }) {
  const nowIso = new Date().toISOString();
  const primaryEmail = pickPrimary(node.emails);
  const primaryPhone = pickPrimary(node.phones);
  const billing = node.billingAddress || {};
  const name =
    String(node.name || "").trim() ||
    [node.firstName, node.lastName].filter(Boolean).join(" ").trim();

  const properties = node.clientProperties?.nodes || node.properties?.nodes || [];
  const primaryProperty =
    properties.find((property) => property?.address) || properties[0];
  const serviceAddress = primaryProperty?.address || billing;

  return {
    tenant_id: tenantId,
    user_id: userId || null,
    created_by: userId || null,
    name: name || "Unnamed client",
    email: String(primaryEmail?.address || "").trim(),
    phone: String(primaryPhone?.friendly || primaryPhone?.number || "").trim(),
    company: String(node.companyName || "").trim(),
    address: formatAddress(serviceAddress) || formatAddress(billing),
    city: String(serviceAddress?.city || billing?.city || "").trim(),
    state: String(serviceAddress?.province || billing?.province || "").trim(),
    zip_code: String(serviceAddress?.postalCode || billing?.postalCode || "").trim(),
    notes: "",
    jobber_id: String(node.id || "").trim(),
    jobber_metadata: {
      jobberWebUri: node.jobberWebUri || "",
      isCompany: Boolean(node.isCompany),
      source: "jobber",
      emails: (Array.isArray(node.emails) ? node.emails : [])
        .map((entry) => ({
          address: String(entry?.address || "").trim(),
          primary: Boolean(entry?.primary),
          description: String(entry?.description || "").trim(),
        }))
        .filter((entry) => entry.address),
      phones: (Array.isArray(node.phones) ? node.phones : [])
        .map((entry) => ({
          number: String(entry?.friendly || entry?.number || "").trim(),
          primary: Boolean(entry?.primary),
          description: String(entry?.description || "").trim(),
        }))
        .filter((entry) => entry.number),
    },
    updated_at: nowIso,
    created_at: nowIso,
  };
}

export function mapJobberPropertyRows(properties = [], { tenantId, clientId }) {
  const nowIso = new Date().toISOString();
  return properties.map((property, index) => {
    const address = property?.address || {};
    return {
      tenant_id: tenantId,
      client_id: clientId,
      jobber_id: String(property?.id || "").trim(),
      label: String(property?.name || `Property ${index + 1}`).trim(),
      address: formatAddress(address),
      city: String(address.city || "").trim(),
      state: String(address.province || "").trim(),
      zip_code: String(address.postalCode || "").trim(),
      is_primary: index === 0,
      metadata: { source: "jobber" },
      updated_at: nowIso,
      created_at: nowIso,
    };
  });
}

export function mapJobberNoteRows(notes = [], { tenantId, clientId }) {
  const nowIso = new Date().toISOString();
  return notes.map((note) => ({
    tenant_id: tenantId,
    client_id: clientId,
    jobber_id: String(note?.id || "").trim(),
    body: String(
      note?.message || note?.body || note?.content || note?.text || "",
    ).trim(),
    source: "jobber",
    created_at: note?.createdAt || nowIso,
    updated_at: nowIso,
  }));
}

export function mapJobberJobRow(node = {}, { tenantId, userId, clientId }) {
  const nowIso = new Date().toISOString();
  return {
    tenant_id: tenantId,
    user_id: userId || null,
    created_by: userId || null,
    client_id: clientId,
    client_name: "",
    title: String(node.title || `Job #${node.jobNumber || ""}`).trim(),
    description: String(node.instructions || "").trim(),
    service: String(node.title || "").trim(),
    status: mapJobberJobStatus(node.jobStatus),
    scope_details: String(node.instructions || "").trim(),
    jobber_id: String(node.id || "").trim(),
    updated_at: nowIso,
    created_at: nowIso,
  };
}

export function mapJobberQuoteRow(node = {}, { tenantId, userId, clientId, clientRow }) {
  const nowIso = new Date().toISOString();
  const quoteNumber = String(
    node.quoteNumber || node.number || node.id?.slice(-8) || "",
  ).trim();

  return {
    tenant_id: String(tenantId),
    user_id: userId || null,
    created_by: userId ? String(userId) : null,
    quote_number: quoteNumber,
    title: String(node.title || node.name || "Quote").trim(),
    client_id: String(clientId),
    client_name: String(clientRow?.name || "").trim(),
    client_email: String(clientRow?.email || "").trim(),
    client_phone: String(clientRow?.phone || "").trim(),
    address_line1: String(clientRow?.address || "").trim(),
    city: String(clientRow?.city || "").trim(),
    state: String(clientRow?.state || "").trim(),
    zip: String(clientRow?.zip_code || "").trim(),
    property_address: String(clientRow?.address || "").trim(),
    line_items: mapJobberLineItems(node.lineItems?.nodes || node.lineItems || []),
    scope_of_work: String(node.message || node.description || "").trim(),
    status: mapJobberQuoteStatus(node.quoteStatus || node.status),
    jobber_id: String(node.id || "").trim(),
    updated_at: nowIso,
    created_at: nowIso,
  };
}

export function mapJobberInvoiceRow(node = {}, { tenantId, userId, clientId, clientRow }) {
  const nowIso = new Date().toISOString();
  const total =
    Number(node.total ?? node.amounts?.total ?? node.invoiceTotal ?? 0) || 0;
  const invoiceNumber = String(
    node.invoiceNumber || node.number || node.id?.slice(-8) || "",
  ).trim();

  return {
    tenant_id: tenantId,
    user_id: userId || null,
    created_by: userId || null,
    client_id: clientId,
    client_name: String(clientRow?.name || "").trim(),
    client_email: String(clientRow?.email || "").trim(),
    invoice_number: invoiceNumber,
    invoice_title: String(node.subject || node.title || "Invoice").trim(),
    amount: total,
    total_cents: Math.round(total * 100),
    subtotal_cents: Math.round(total * 100),
    tax_cents: 0,
    status: mapJobberInvoiceStatus(node.invoiceStatus || node.status),
    items: mapJobberLineItems(node.lineItems?.nodes || node.lineItems || []),
    payments: [],
    paid_amount: 0,
    balance_due: total,
    notes: "",
    jobber_id: String(node.id || "").trim(),
    updated_at: nowIso,
    created_at: nowIso,
  };
}

export function mapJobberVisitRow(node = {}, { tenantId, clientId, jobId }) {
  const nowIso = new Date().toISOString();
  return {
    tenant_id: tenantId,
    client_id: clientId,
    job_id: jobId || null,
    jobber_id: String(node.id || "").trim(),
    title: String(node.title || "Visit").trim(),
    status: String(node.visitStatus || node.status || "").trim(),
    start_at: node.startAt || null,
    end_at: node.endAt || null,
    completed_at: node.completedAt || null,
    instructions: String(node.instructions || "").trim(),
    metadata: { source: "jobber" },
    updated_at: nowIso,
    created_at: nowIso,
  };
}

export function mapJobberRequestRow(node = {}, { tenantId, clientId }) {
  const nowIso = new Date().toISOString();
  return {
    tenant_id: tenantId,
    client_id: clientId,
    jobber_id: String(node.id || "").trim(),
    title: String(node.title || "Request").trim(),
    status: String(node.requestStatus || node.status || "").trim(),
    details: String(node.details || node.description || "").trim(),
    metadata: { source: "jobber" },
    updated_at: nowIso,
    created_at: nowIso,
  };
}

function mapJobberLineItems(items = []) {
  return items.map((item, index) => {
    const qty = Number(item.qty || item.quantity || 1) || 1;
    const unit = Number(item.unitPrice || item.cost || item.price || 0) || 0;
    const total = Number(item.total || qty * unit) || qty * unit;
    return {
      id: String(item.id || `li-${index}`),
      name: String(item.name || item.description || "Line item").trim(),
      description: String(item.description || item.name || "").trim(),
      qty,
      unitPrice: unit,
      total,
    };
  });
}

function mapJobberJobStatus(status) {
  const normalized = String(status || "").toUpperCase();
  if (normalized.includes("COMPLETED") || normalized.includes("ARCHIVED")) {
    return "Completed";
  }
  if (normalized.includes("ACTIVE") || normalized.includes("PROGRESS")) {
    return "In Progress";
  }
  return "Pending";
}

function mapJobberQuoteStatus(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized.includes("approved")) return "approved";
  if (normalized.includes("sent")) return "sent";
  if (normalized.includes("draft")) return "draft";
  return "draft";
}

function mapJobberInvoiceStatus(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized.includes("paid")) return "Paid";
  if (normalized.includes("sent")) return "Sent";
  if (normalized.includes("overdue")) return "Overdue";
  return "Unpaid";
}
