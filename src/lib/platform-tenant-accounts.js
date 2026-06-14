function toTenantId(value) {
  return String(value || "default").trim() || "default";
}

/** Role from Supabase auth user row (app_metadata preferred). */
export function parseAccountRole(user) {
  return String(
    user?.app_metadata?.role || user?.user_metadata?.role || "viewer",
  ).toLowerCase();
}

/** Tenant accounts visible in owner command center (everyone except platform operators). */
export function isPlatformTenantAccount(user) {
  return parseAccountRole(user) !== "super_admin";
}

/** CRM tables key rows by UUID tenant_id; prefer stored tenant_db_id when present. */
export function tenantDbIdFromUser(user) {
  return String(
    user?.app_metadata?.tenant_db_id ||
      user?.app_metadata?.tenantDbId ||
      user?.id ||
      "",
  ).trim();
}

export function tenantSlugFromUser(user) {
  return toTenantId(
    user?.app_metadata?.tenant_id ||
      user?.app_metadata?.tenantId ||
      user?.user_metadata?.tenant_id ||
      user?.user_metadata?.tenantId,
  );
}

export function computeTenantAccountStatus(user) {
  const meta = user?.user_metadata || {};

  if (meta.complimentaryAccess === true) return "active";
  if (meta.isSubscribed === true) return "active";

  const trialEndMs = meta.trialEndDate ? new Date(meta.trialEndDate).getTime() : 0;
  if (Number.isFinite(trialEndMs) && trialEndMs > 0) {
    return trialEndMs > Date.now() ? "trial" : "expired";
  }

  const raw = String(meta.status || user?.app_metadata?.status || "").toLowerCase();
  if (raw === "pending_verification" || raw === "pending") return "pending";
  if (["active", "trial", "expired"].includes(raw)) return raw;

  const created = new Date(user?.created_at || 0).getTime();
  if (!Number.isFinite(created) || created <= 0) return "trial";
  const ageDays = (Date.now() - created) / (1000 * 60 * 60 * 24);
  return ageDays > 30 ? "active" : "trial";
}
