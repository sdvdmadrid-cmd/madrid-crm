const CLIENT_LEAD_STATUSES = new Set([
  "new_lead",
  "contacted",
  "estimate_sent",
  "waiting_approval",
  "won",
  "lost",
]);

export const CLIENT_SELECT_COLUMNS = [
  "id",
  "tenant_id",
  "user_id",
  "created_by",
  "name",
  "phone",
  "email",
  "address",
  "city",
  "state",
  "zip_code",
  "latitude",
  "longitude",
  "company",
  "notes",
  "lead_status",
  "estimate_sent",
  "won_at",
  "created_at",
  "updated_at",
  "billing_address",
  "billing_city",
  "billing_state",
  "billing_zip",
  "billing_same_as_service",
].join(", ");

function toText(value) {
  return String(value ?? "").trim();
}

function toOptionalTimestamp(value) {
  if (!value) return null;

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function normalizeLeadStatus(value) {
  const normalized = toText(value).toLowerCase() || "new_lead";
  return CLIENT_LEAD_STATUSES.has(normalized) ? normalized : "new_lead";
}

function toNullableCoordinate(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function composeAddress(body = {}) {
  const directAddress = toText(body.address);
  if (directAddress) return directAddress;

  const line1 = toText(body.addressLine1);
  const line2 = toText(body.addressLine2);
  const locality = [toText(body.city), toText(body.state), toText(body.zip)]
    .filter(Boolean)
    .join(" ");

  return [line1, line2, locality].filter(Boolean).join(", ");
}

function normalizeClientBody(body = {}) {
  return {
    name: toText(body.name),
    email: toText(body.email),
    phone: toText(body.phone),
    address: composeAddress(body),
    city: toText(body.city),
    state: toText(body.state),
    zipCode: toText(body.zip ?? body.zipCode),
    latitude: toNullableCoordinate(body.latitude),
    longitude: toNullableCoordinate(body.longitude),
    company: toText(body.company ?? body.companyName),
    notes: toText(body.notes),
    leadStatus: normalizeLeadStatus(body.leadStatus ?? body.lead_status),
    estimateSent: Boolean(body.estimateSent ?? body.estimate_sent),
    wonAt: toOptionalTimestamp(body.wonAt ?? body.won_at),
    billingAddress: toText(body.billing_address ?? body.billingAddress),
    billingCity: toText(body.billing_city ?? body.billingCity),
    billingState: toText(body.billing_state ?? body.billingState),
    billingZip: toText(body.billing_zip ?? body.billingZip),
    billingSameAsService: (body.billing_same_as_service ?? body.billingSameAsService) !== false,
  };
}

export function serializeClient(doc = {}) {
  return {
    ...doc,
    id: doc.id,
    _id: doc.id,
    tenantId: doc.tenant_id || "",
    userId: doc.user_id || null,
    company: doc.company || "",
    companyName: doc.company || "",
    city: doc.city || "",
    state: doc.state || "",
    zip: doc.zip_code || "",
    zipCode: doc.zip_code || "",
    latitude:
      typeof doc.latitude === "number" ? doc.latitude : null,
    longitude:
      typeof doc.longitude === "number" ? doc.longitude : null,
    notes: doc.notes || "",
    leadStatus: normalizeLeadStatus(doc.lead_status || doc.leadStatus),
    estimateSent: Boolean(doc.estimate_sent ?? doc.estimateSent),
    wonAt: doc.won_at || doc.wonAt || null,
    createdAt: doc.created_at || null,
    updatedAt: doc.updated_at || null,
    billing_address: doc.billing_address || "",
    billing_city: doc.billing_city || "",
    billing_state: doc.billing_state || "",
    billing_zip: doc.billing_zip || "",
    billing_same_as_service: doc.billing_same_as_service !== false,
  };
}

export function buildClientInsertRow(body, { tenantId, userId }) {
  const nowIso = new Date().toISOString();
  const normalized = normalizeClientBody(body);

  if (!normalized.name) {
    throw createClientValidationError("Client name is required");
  }

  return {
    name: normalized.name,
    email: normalized.email,
    phone: normalized.phone,
    address: normalized.address,
    city: normalized.city,
    state: normalized.state,
    zip_code: normalized.zipCode,
    latitude: normalized.latitude,
    longitude: normalized.longitude,
    company: normalized.company,
    notes: normalized.notes,
    lead_status: normalized.leadStatus,
    estimate_sent: normalized.estimateSent,
    won_at: normalized.leadStatus === "won" ? normalized.wonAt || nowIso : null,
    billing_address: normalized.billingAddress,
    billing_city: normalized.billingCity,
    billing_state: normalized.billingState,
    billing_zip: normalized.billingZip,
    billing_same_as_service: normalized.billingSameAsService,
    tenant_id: tenantId,
    user_id: userId || null,
    created_by: userId || null,
    created_at: nowIso,
    updated_at: nowIso,
  };
}

export function buildClientUpdateRow(body = {}) {
  const normalized = normalizeClientBody(body);
  const updateRow = {
    updated_at: new Date().toISOString(),
  };

  if ("name" in body) {
    if (!normalized.name) {
      throw createClientValidationError("Client name is required");
    }
    updateRow.name = normalized.name;
  }

  if ("email" in body) updateRow.email = normalized.email;
  if ("phone" in body) updateRow.phone = normalized.phone;
  if (
    "address" in body ||
    "addressLine1" in body ||
    "addressLine2" in body ||
    "city" in body ||
    "state" in body ||
    "zip" in body
  ) {
    updateRow.address = normalized.address;
  }
  if ("city" in body) updateRow.city = normalized.city;
  if ("state" in body) updateRow.state = normalized.state;
  if ("zip" in body || "zipCode" in body) {
    updateRow.zip_code = normalized.zipCode;
  }
  if ("latitude" in body) updateRow.latitude = normalized.latitude;
  if ("longitude" in body) updateRow.longitude = normalized.longitude;
  if ("company" in body || "companyName" in body) {
    updateRow.company = normalized.company;
  }
  if ("notes" in body) updateRow.notes = normalized.notes;
  if ("estimateSent" in body || "estimate_sent" in body) {
    updateRow.estimate_sent = normalized.estimateSent;
  }
  if ("billing_address" in body || "billingAddress" in body) updateRow.billing_address = normalized.billingAddress;
  if ("billing_city" in body || "billingCity" in body) updateRow.billing_city = normalized.billingCity;
  if ("billing_state" in body || "billingState" in body) updateRow.billing_state = normalized.billingState;
  if ("billing_zip" in body || "billingZip" in body) updateRow.billing_zip = normalized.billingZip;
  if ("billing_same_as_service" in body || "billingSameAsService" in body) updateRow.billing_same_as_service = normalized.billingSameAsService;
  if ("leadStatus" in body || "lead_status" in body) {
    updateRow.lead_status = normalized.leadStatus;
    updateRow.won_at =
      normalized.leadStatus === "won"
        ? normalized.wonAt || updateRow.updated_at
        : null;
  }
  if ("wonAt" in body || "won_at" in body) {
    updateRow.won_at = normalized.wonAt;
  }

  return updateRow;
}

export function createClientValidationError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

export function getClientSchemaMismatchColumn(error) {
  const message = String(error?.message || "");
  const postgrestMatch = message.match(
    /Could not find the '([^']+)' column of 'clients'/i,
  );
  if (postgrestMatch?.[1]) return postgrestMatch[1];

  const postgresMatch = message.match(
    /column clients\.([a-zA-Z0-9_]+) does not exist/i,
  );
  if (postgresMatch?.[1]) return postgresMatch[1];

  return "";
}

export function createClientErrorResponse(error, fallbackMessage) {
  const column = getClientSchemaMismatchColumn(error);
  if (column) {
    return new Response(
      JSON.stringify({
        success: false,
        error: `Clients data is unavailable because the database schema is missing column '${column}'. Apply the latest Supabase migrations and reload the schema cache.`,
      }),
      {
        status: 503,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const statusCode = Number(error?.statusCode || 500);
  return new Response(
    JSON.stringify({
      success: false,
      error: error?.message || fallbackMessage,
    }),
    {
      status: statusCode,
      headers: { "Content-Type": "application/json" },
    },
  );
}
