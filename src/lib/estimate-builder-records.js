function toText(value) {
  return String(value ?? "").trim();
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Build a safe PATCH row for estimate_builder (no tenant_id / id mass assignment).
 */
export function buildEstimateBuilderUpdateRow(body = {}) {
  const row = {
    updated_at: new Date().toISOString(),
  };

  if ("name" in body) row.name = toText(body.name);
  if ("notes" in body) row.notes = String(body.notes ?? "");
  if ("description" in body) row.description = String(body.description ?? "");
  if ("lines" in body) {
    row.lines = Array.isArray(body.lines) ? body.lines : [];
  }

  if ("totalLow" in body || "total_low" in body) {
    row.total_low = toNumber(body.totalLow ?? body.total_low);
  }
  if ("totalHigh" in body || "total_high" in body) {
    row.total_high = toNumber(body.totalHigh ?? body.total_high);
  }
  if ("totalMid" in body || "total_mid" in body) {
    row.total_mid = toNumber(body.totalMid ?? body.total_mid);
  }
  if ("totalFinal" in body || "total_final" in body) {
    row.total_final = toNumber(body.totalFinal ?? body.total_final);
  }

  const clientId = body.clientId ?? body.client_id;
  if ("clientId" in body || "client_id" in body) {
    const normalized = toText(clientId);
    row.client_id = normalized || null;
    row.clientId = normalized || null;
  }

  const quoteId = body.quoteId ?? body.quote_id;
  if ("quoteId" in body || "quote_id" in body) {
    const normalized = toText(quoteId);
    row.quote_id = normalized || null;
    row.quoteId = normalized || null;
  }

  if ("lastSentAt" in body || "last_sent_at" in body) {
    const raw = body.lastSentAt ?? body.last_sent_at;
    row.last_sent_at = raw ? new Date(raw).toISOString() : null;
    row.lastSentAt = row.last_sent_at;
  }

  return row;
}

/**
 * Build a safe INSERT row for estimate_builder.
 */
export function buildEstimateBuilderInsertRow(body = {}, { tenantDbId, userId, estimateNumber }) {
  const nowIso = new Date().toISOString();
  const patch = buildEstimateBuilderUpdateRow(body);

  const clientRef = patch.client_id ?? toText(body.clientId ?? body.client_id);
  const quoteRef = patch.quote_id ?? toText(body.quoteId ?? body.quote_id);

  return {
    name: (patch.name ?? toText(body.name)) || "Untitled estimate",
    notes: patch.notes ?? String(body.notes ?? ""),
    description: patch.description ?? String(body.description ?? ""),
    lines: patch.lines ?? (Array.isArray(body.lines) ? body.lines : []),
    total_low: patch.total_low ?? toNumber(body.totalLow ?? body.total_low),
    total_high: patch.total_high ?? toNumber(body.totalHigh ?? body.total_high),
    total_mid: patch.total_mid ?? toNumber(body.totalMid ?? body.total_mid),
    total_final: patch.total_final ?? toNumber(body.totalFinal ?? body.total_final),
    client_id: clientRef || null,
    clientId: clientRef || null,
    quote_id: quoteRef || null,
    quoteId: quoteRef || null,
    estimate_number: estimateNumber,
    tenant_id: tenantDbId,
    user_id: userId || null,
    created_by: userId || null,
    created_at: nowIso,
    updated_at: nowIso,
  };
}
