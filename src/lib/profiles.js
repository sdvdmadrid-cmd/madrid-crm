import "server-only";

import { normalizeAppRole } from "@/lib/access-control";
import { supabaseAdmin } from "@/lib/supabase-admin";

const PROFILES = "profiles";

function toPersistedProfileRole(role) {
  const normalized = normalizeAppRole(role);
  if (normalized === "super_admin") return "admin";
  if (normalized === "admin") return "admin";
  return "worker";
}

function mapProfile(row) {
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    role: normalizeAppRole(row.role),
  };
}

export async function getProfileByUserId(userId) {
  if (!userId) return null;

  const { data, error } = await supabaseAdmin
    .from(PROFILES)
    .select("id, tenant_id, role")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return mapProfile(data);
}

export async function countProfilesInTenant(tenantId) {
  if (!tenantId) return 0;

  const { count, error } = await supabaseAdmin
    .from(PROFILES)
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId);

  if (error) {
    throw new Error(error.message);
  }

  return Number(count || 0);
}

export async function upsertProfile({ id, tenantId, role }) {
  if (!id) {
    throw new Error("Profile user id is required");
  }
  if (!tenantId) {
    throw new Error("Profile tenant id is required");
  }

  const { data, error } = await supabaseAdmin
    .from(PROFILES)
    .upsert(
      {
        id,
        tenant_id: tenantId,
        // profiles.role only supports admin/worker in current DB constraint.
        role: toPersistedProfileRole(role),
      },
      { onConflict: "id" },
    )
    .select("id, tenant_id, role")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return mapProfile(data);
}

export async function ensureProfileForUser({ userId, tenantId, role }) {
  const existing = await getProfileByUserId(userId);
  if (existing) {
    return existing;
  }

  return upsertProfile({ id: userId, tenantId, role });
}
