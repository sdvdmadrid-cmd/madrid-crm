/**
 * Pure validation + normalization for client CSV import rows.
 */

export function normalizeEmailForMatch(email) {
  const raw = String(email || "").trim().toLowerCase();
  if (!raw || !raw.includes("@")) return "";
  if (raw.length > 254) return "";
  return raw;
}

export function normalizePhoneForMatch(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 11 && digits.startsWith("1")) {
    return digits.slice(1);
  }
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

export function isValidEmailFormat(email) {
  const raw = String(email || "").trim();
  if (!raw) return true;
  if (raw.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw);
}

export function isValidPhoneFormat(phone) {
  const raw = String(phone || "").trim();
  if (!raw) return true;
  const digits = raw.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
}

/**
 * Map a CSV record object to a normalized client payload using column mapping.
 * @param {Record<string, string>} record
 * @param {Record<string, string>} mapping fieldKey -> csvHeader
 */
export function mapRecordToClientPayload(record, mapping = {}) {
  const pick = (fieldKey) => {
    const header = String(mapping[fieldKey] || "").trim();
    if (!header) return "";
    return String(record[header] ?? "").trim();
  };

  let name = pick("name");
  if (!name) {
    const parts = [pick("firstName"), pick("lastName")].filter(Boolean);
    name = parts.join(" ").trim();
  }

  return {
    name,
    email: pick("email"),
    phone: pick("phone"),
    address: pick("address"),
    city: pick("city"),
    state: pick("state"),
    zip: pick("zip"),
    company: pick("company"),
    notes: pick("notes"),
    leadStatus: "new_lead",
    billing_same_as_service: true,
  };
}

/**
 * @returns {{ ok: boolean, errors: string[], payload: object }}
 */
export function validateClientImportPayload(payload) {
  const errors = [];
  const name = String(payload.name || "").trim();

  if (!name) {
    errors.push("Name is required");
  } else if (name.length > 200) {
    errors.push("Name is too long (max 200 characters)");
  }

  const email = String(payload.email || "").trim();
  if (email && !isValidEmailFormat(email)) {
    errors.push("Email format is invalid");
  }

  const phone = String(payload.phone || "").trim();
  if (phone && !isValidPhoneFormat(phone)) {
    errors.push("Phone number looks invalid");
  }

  const address = String(payload.address || "").trim();
  if (address.length > 500) {
    errors.push("Address is too long");
  }

  return {
    ok: errors.length === 0,
    errors,
    payload: {
      ...payload,
      name,
      email,
      phone,
      address,
    },
  };
}

/**
 * Classify a row for preview / commit.
 * @param {object} params
 */
export function classifyImportRow({
  rowIndex,
  validation,
  duplicateInFile,
  existingClient,
}) {
  if (!validation.ok) {
    return {
      rowIndex,
      status: "invalid",
      errors: validation.errors,
      payload: validation.payload,
      duplicateInFile: false,
      existingClientId: null,
      existingClientName: null,
    };
  }

  if (duplicateInFile) {
    return {
      rowIndex,
      status: "duplicate_file",
      errors: ["Duplicate email or phone within this CSV"],
      payload: validation.payload,
      duplicateInFile: true,
      existingClientId: null,
      existingClientName: null,
    };
  }

  if (existingClient) {
    return {
      rowIndex,
      status: "duplicate_existing",
      errors: [],
      payload: validation.payload,
      duplicateInFile: false,
      existingClientId: existingClient.id,
      existingClientName: existingClient.name || "",
    };
  }

  return {
    rowIndex,
    status: "ready",
    errors: [],
    payload: validation.payload,
    duplicateInFile: false,
    existingClientId: null,
    existingClientName: null,
  };
}
