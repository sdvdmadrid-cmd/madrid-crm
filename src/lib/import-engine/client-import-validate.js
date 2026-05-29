/**
 * Pure validation + normalization for client CSV import rows.
 */

import { isLocalityOnlyAddress } from "../client-display.js";
import { parseCombinedAddressString } from "./parse-combined-address.js";
import { getImportFieldAliases } from "./providers/index.js";

export function normalizeEmailForMatch(email) {
  const raw = String(email || "").trim().toLowerCase();
  if (!raw || !raw.includes("@")) return "";
  if (raw.length > 254) return "";
  return raw;
}

export function normalizeNameForMatch(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
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

const PLACEHOLDER_EMAIL = /^(n\/a|na|none|no email|no-email|-|\.|—)$/i;

/**
 * CRM exports often include placeholder or malformed contact fields.
 * Clears bad values so the row can still import on name + address.
 * @param {object} payload
 */
export function normalizeImportContactFields(payload) {
  let email = String(payload.email || "").trim();
  let phone = String(payload.phone || "").trim();

  if (email) {
    if (PLACEHOLDER_EMAIL.test(email)) {
      email = "";
    } else if (/[;,]/.test(email)) {
      const first = email.split(/[;,]/)[0].trim();
      email = isValidEmailFormat(first) ? first : "";
    } else if (!isValidEmailFormat(email)) {
      email = "";
    }
  }

  if (phone) {
    const digits = phone.replace(/\D/g, "");
    if (digits.length >= 7 && digits.length <= 15) {
      phone = phone;
    } else if (!isValidPhoneFormat(phone)) {
      phone = "";
    }
  }

  return {
    ...payload,
    email,
    phone,
  };
}

function normalizeHeaderKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function findRecordValueByHeader(record, headerName) {
  const target = normalizeHeaderKey(headerName);
  if (!target) return "";

  if (Object.prototype.hasOwnProperty.call(record, headerName)) {
    return String(record[headerName] ?? "").trim();
  }

  for (const [key, value] of Object.entries(record)) {
    if (normalizeHeaderKey(key) === target) {
      return String(value ?? "").trim();
    }
  }

  return "";
}

function pickFieldValue(record, mapping, fieldKey) {
  const mappedHeader = String(mapping[fieldKey] || "").trim();
  if (mappedHeader) {
    const mapped = findRecordValueByHeader(record, mappedHeader);
    if (mapped) return mapped;
  }

  for (const alias of getImportFieldAliases(fieldKey)) {
    const value = findRecordValueByHeader(record, alias);
    if (value) return value;
  }

  return "";
}

/** Jobber / CRM exports often use one "Address" column with the full line. */
function findLooseAddressColumn(record = {}) {
  for (const [key, value] of Object.entries(record)) {
    const header = normalizeHeaderKey(key);
    if (
      header !== "address" &&
      header !== "service address" &&
      header !== "property address" &&
      header !== "billing address"
    ) {
      continue;
    }
    const text = String(value ?? "").trim();
    if (text && (text.includes(",") || /\d/.test(text))) {
      return text;
    }
  }
  return "";
}

function pickFirstMapped(record, mapping, fieldKeys = []) {
  for (const key of fieldKeys) {
    const value = pickFieldValue(record, mapping, key);
    if (value) return value;
  }
  return "";
}

/**
 * Map a CSV record object to a normalized client payload using column mapping.
 * @param {Record<string, string>} record
 * @param {Record<string, string>} mapping fieldKey -> csvHeader
 */
export function mapRecordToClientPayload(record, mapping = {}) {
  let name = pickFieldValue(record, mapping, "name");
  if (!name) {
    const parts = [
      pickFieldValue(record, mapping, "firstName"),
      pickFieldValue(record, mapping, "lastName"),
    ].filter(Boolean);
    name = parts.join(" ").trim();
  }
  if (!name) {
    name = pickFieldValue(record, mapping, "company");
  }

  let line1 =
    pickFieldValue(record, mapping, "address") ||
    findLooseAddressColumn(record);
  const line2 = pickFieldValue(record, mapping, "addressLine2");
  let city = pickFieldValue(record, mapping, "city");
  let state = pickFieldValue(record, mapping, "state");
  let zip = pickFieldValue(record, mapping, "zip");

  if (line1 && line1.includes(",")) {
    const parsed = parseCombinedAddressString(line1);
    if (parsed.street) {
      line1 = parsed.street;
      if (!city && parsed.city) city = parsed.city;
      if (!state && parsed.state) state = parsed.state;
      if (!zip && parsed.zip) zip = parsed.zip;
    }
  }

  let address = line1;
  if (line2) {
    address = address ? `${address}, ${line2}` : line2;
  }

  const billingAddress = pickFieldValue(record, mapping, "billingAddress");
  const billingCity = pickFieldValue(record, mapping, "billingCity");
  const billingState = pickFieldValue(record, mapping, "billingState");
  const billingZip = pickFieldValue(record, mapping, "billingZip");
  const hasBilling =
    Boolean(billingAddress || billingCity || billingState || billingZip);

  const leadRaw = pickFieldValue(record, mapping, "leadStatus");

  return {
    name,
    email: pickFirstMapped(record, mapping, ["email"]),
    phone: pickFirstMapped(record, mapping, [
      "phone",
      "mobilePhone",
      "homePhone",
      "workPhone",
    ]),
    address,
    city,
    state,
    zip,
    company: pickFieldValue(record, mapping, "company"),
    notes: pickFieldValue(record, mapping, "notes"),
    leadStatus: leadRaw || "new_lead",
    billingAddress,
    billingCity,
    billingState,
    billingZip,
    billing_same_as_service: !hasBilling,
  };
}

/**
 * Build an update body that only includes non-empty imported values so
 * partial CSV rows do not wipe existing client data.
 * @param {object} payload
 */
export function buildImportClientUpdateBody(payload = {}) {
  const body = {};

  if (String(payload.name || "").trim()) body.name = payload.name;
  if (String(payload.email || "").trim()) body.email = payload.email;
  if (String(payload.phone || "").trim()) body.phone = payload.phone;
  const street = String(payload.address || "").trim();
  if (street) {
    const hasNumber = /\d/.test(street);
    const localityOnly = isLocalityOnlyAddress(
      street,
      payload.city,
      payload.state,
      payload.zip,
    );
    if (hasNumber || !localityOnly) {
      body.address = street;
    }
  }
  if (String(payload.city || "").trim()) body.city = payload.city;
  if (String(payload.state || "").trim()) body.state = payload.state;
  if (String(payload.zip || "").trim()) body.zip = payload.zip;
  if (String(payload.company || "").trim()) body.company = payload.company;
  if (String(payload.notes || "").trim()) body.notes = payload.notes;
  if (String(payload.leadStatus || "").trim()) body.leadStatus = payload.leadStatus;

  if (String(payload.billingAddress || "").trim()) {
    body.billingAddress = payload.billingAddress;
    body.billing_same_as_service = false;
  }
  if (String(payload.billingCity || "").trim()) {
    body.billingCity = payload.billingCity;
    body.billing_same_as_service = false;
  }
  if (String(payload.billingState || "").trim()) {
    body.billingState = payload.billingState;
    body.billing_same_as_service = false;
  }
  if (String(payload.billingZip || "").trim()) {
    body.billingZip = payload.billingZip;
    body.billing_same_as_service = false;
  }
  if (payload.billing_same_as_service === false) {
    body.billing_same_as_service = false;
  }

  return body;
}

/**
 * @returns {{ ok: boolean, errors: string[], payload: object }}
 */
export function validateClientImportPayload(payload) {
  const cleaned = normalizeImportContactFields(payload);
  const errors = [];
  const name = String(cleaned.name || "").trim();

  if (!name) {
    errors.push("Name is required");
  } else if (name.length > 200) {
    errors.push("Name is too long (max 200 characters)");
  }

  const email = String(cleaned.email || "").trim();
  const phone = String(cleaned.phone || "").trim();
  const address = String(cleaned.address || "").trim();
  if (address.length > 500) {
    errors.push("Address is too long");
  }

  return {
    ok: errors.length === 0,
    errors,
    payload: {
      ...cleaned,
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
      errors: ["Duplicate name, email, or phone within this CSV"],
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
