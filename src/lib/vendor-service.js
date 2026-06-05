import "server-only";

import {
  formatVendorAddress,
  normalizeVendorCategory,
  VENDOR_TABLE,
} from "./vendor-constants.js";
import { supabaseAdmin } from "./supabase-admin.js";
import { scopeByTenant } from "./tenant-scope.js";

function toText(value, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

export function serializeVendor(row = {}) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name || "",
    category: row.category || "other",
    contactPerson: row.contact_person || "",
    phone: row.phone || "",
    email: row.email || "",
    website: row.website || "",
    addressStreet: row.address_street || "",
    addressCity: row.address_city || "",
    addressState: row.address_state || "",
    addressZip: row.address_zip || "",
    addressFormatted: formatVendorAddress({
      address_street: row.address_street,
      address_city: row.address_city,
      address_state: row.address_state,
      address_zip: row.address_zip,
    }),
    paymentTerms: row.payment_terms || "",
    notes: row.notes || "",
    documents: Array.isArray(row.documents) ? row.documents : [],
    metadata: row.metadata || {},
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

export function buildVendorInsertRow(body = {}, tenantId, userId) {
  const now = new Date().toISOString();
  return {
    tenant_id: tenantId,
    name: toText(body.name, 200),
    category: normalizeVendorCategory(body.category),
    contact_person: toText(body.contactPerson, 120),
    phone: toText(body.phone, 40),
    email: toText(body.email, 200).toLowerCase(),
    website: toText(body.website, 300),
    address_street: toText(body.addressStreet, 200),
    address_city: toText(body.addressCity, 120),
    address_state: toText(body.addressState, 40).toUpperCase(),
    address_zip: toText(body.addressZip, 20),
    payment_terms: toText(body.paymentTerms, 120),
    notes: toText(body.notes, 2000),
    documents: Array.isArray(body.documents) ? body.documents : [],
    metadata: body.metadata && typeof body.metadata === "object" ? body.metadata : {},
    created_by: userId || null,
    created_at: now,
    updated_at: now,
  };
}

export function buildVendorUpdateRow(body = {}) {
  const row = { updated_at: new Date().toISOString() };
  if ("name" in body) row.name = toText(body.name, 200);
  if ("category" in body) row.category = normalizeVendorCategory(body.category);
  if ("contactPerson" in body) row.contact_person = toText(body.contactPerson, 120);
  if ("phone" in body) row.phone = toText(body.phone, 40);
  if ("email" in body) row.email = toText(body.email, 200).toLowerCase();
  if ("website" in body) row.website = toText(body.website, 300);
  if ("addressStreet" in body) row.address_street = toText(body.addressStreet, 200);
  if ("addressCity" in body) row.address_city = toText(body.addressCity, 120);
  if ("addressState" in body) row.address_state = toText(body.addressState, 40).toUpperCase();
  if ("addressZip" in body) row.address_zip = toText(body.addressZip, 20);
  if ("paymentTerms" in body) row.payment_terms = toText(body.paymentTerms, 120);
  if ("notes" in body) row.notes = toText(body.notes, 2000);
  if ("documents" in body && Array.isArray(body.documents)) row.documents = body.documents;
  if ("metadata" in body && body.metadata && typeof body.metadata === "object") {
    row.metadata = body.metadata;
  }
  return row;
}

export async function listVendorsForTenant({ tenantDbId, role, category, search, limit = 200 }) {
  let query = supabaseAdmin
    .from(VENDOR_TABLE)
    .select("*")
    .eq("tenant_id", tenantDbId)
    .order("name", { ascending: true })
    .limit(Math.min(500, Math.max(1, limit)));

  if (category) query = query.eq("category", normalizeVendorCategory(category));

  const { data, error } = await scopeByTenant(query, { tenantDbId, role });
  if (error) throw new Error(error.message);

  let rows = (data || []).map(serializeVendor);
  const q = String(search || "").trim().toLowerCase();
  if (q) {
    rows = rows.filter(
      (v) =>
        v.name.toLowerCase().includes(q) ||
        v.contactPerson.toLowerCase().includes(q) ||
        v.email.toLowerCase().includes(q),
    );
  }
  return rows;
}

export async function getVendorById({ tenantDbId, role, vendorId }) {
  const { data, error } = await scopeByTenant(
    supabaseAdmin.from(VENDOR_TABLE).select("*").eq("id", vendorId).maybeSingle(),
    { tenantDbId, role },
  );
  if (error) throw new Error(error.message);
  return data ? serializeVendor(data) : null;
}

export async function createVendor({ tenantDbId, role, userId, body }) {
  if (!toText(body?.name)) throw new Error("Vendor name is required.");

  const row = buildVendorInsertRow(body, tenantDbId, userId);
  const { data, error } = await supabaseAdmin.from(VENDOR_TABLE).insert(row).select("*").single();
  if (error) throw new Error(error.message);
  return serializeVendor(data);
}

export async function updateVendor({ tenantDbId, role, vendorId, body }) {
  const updateRow = buildVendorUpdateRow(body);
  if (Object.keys(updateRow).length <= 1) throw new Error("No updates provided.");

  const { data, error } = await scopeByTenant(
    supabaseAdmin
      .from(VENDOR_TABLE)
      .update(updateRow)
      .eq("id", vendorId)
      .select("*")
      .maybeSingle(),
    { tenantDbId, role },
  );
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Vendor not found.");
  return serializeVendor(data);
}

export async function deleteVendor({ tenantDbId, role, vendorId }) {
  const { error } = await scopeByTenant(
    supabaseAdmin.from(VENDOR_TABLE).delete().eq("id", vendorId),
    { tenantDbId, role },
  );
  if (error) throw new Error(error.message);
}
