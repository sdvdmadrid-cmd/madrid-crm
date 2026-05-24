import { supabaseAdmin } from "@/lib/supabase-admin";

function isSuperAdmin(role) {
  return String(role || "").toLowerCase() === "super_admin";
}

/**
 * Verify a client id belongs to the authenticated tenant (or exists for super_admin).
 * @returns {{ ok: true, client: object } | { ok: false, error: string, status: number }}
 */
export async function assertTenantClient({ tenantDbId, role, clientId }) {
  const id = String(clientId || "").trim();
  if (!id) {
    return { ok: false, error: "Client not found", status: 404 };
  }

  let query = supabaseAdmin.from("clients").select("id, tenant_id").eq("id", id);
  if (!isSuperAdmin(role)) {
    query = query.eq("tenant_id", tenantDbId);
  }

  const { data, error } = await query.maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    return { ok: false, error: "Client not found", status: 404 };
  }

  return { ok: true, client: data };
}

/**
 * Verify a quote id belongs to the authenticated tenant (or exists for super_admin).
 */
export async function assertTenantQuote({ tenantDbId, role, quoteId }) {
  const id = String(quoteId || "").trim();
  if (!id) {
    return { ok: true, quote: null };
  }

  let query = supabaseAdmin.from("quotes").select("id, tenant_id, status").eq("id", id);
  if (!isSuperAdmin(role)) {
    query = query.eq("tenant_id", tenantDbId);
  }

  const { data, error } = await query.maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    return { ok: false, error: "Quote not found", status: 404 };
  }

  return { ok: true, quote: data };
}
