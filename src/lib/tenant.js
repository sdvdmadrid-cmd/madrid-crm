import {
  canDeleteRecords,
  canManageSensitiveData,
  canSendExternalCommunications,
  canWriteOperationalData,
  getRoleCapabilities,
  isSuperAdminRole,
  normalizeAppRole,
} from "@/lib/access-control";
import { getSessionFromRequest } from "@/lib/auth";
import {
  getSupabaseUserFromRequest,
  normalizeAuthUser,
  resolveProfileForUser,
} from "@/lib/supabase-auth";

const DEFAULT_TENANT_ID = "default";

export function getTenantContext(request) {
  const session = getSessionFromRequest(request);
  if (session?.tenantId) {
    const normalizedRole = normalizeAppRole(session.role);
    const capabilities = getRoleCapabilities(normalizedRole);
    return {
      tenantId: session.tenantId,
      tenantDbId: session.tenantDbId || session.userId || null,
      role: normalizedRole,
      userId: session.userId || "system",
      email: session.email || null,
      name: session.name || "",
      companyName: session.companyName || "",
      businessType: session.businessType || session.industry || "",
      isSubscribed: session.isSubscribed === true,
      trialEndDate: session.trialEndDate || null,
      isSuperAdmin: isSuperAdminRole(normalizedRole),
      authenticated: true,
      capabilities,
    };
  }

  // No header fallback — never trust client-supplied tenant/role headers.
  // The middleware enforces auth on protected routes; unauthenticated callers
  // hitting public routes (webhooks etc.) must supply tenantId explicitly.
  return {
    tenantId: null,
    tenantDbId: null,
    role: null,
    userId: null,
    email: null,
    name: "",
    businessType: "",
    isSubscribed: false,
    trialEndDate: null,
    isSuperAdmin: false,
    authenticated: false,
    capabilities: getRoleCapabilities(null),
  };
}

export async function getAuthenticatedTenantContext(request) {
  const session = getSessionFromRequest(request);
  if (!session?.tenantId) {
    return getTenantContext(request);
  }

  const fallback = getTenantContext(request);

  try {
    const { user, error } = await getSupabaseUserFromRequest(request);
    if (error) {
      console.error(
        "[tenant] Failed to resolve Supabase user from request",
        error,
      );
      return fallback;
    }

    if (!user?.id) {
      return fallback;
    }

    const profile = await resolveProfileForUser(user, {
      tenantId: fallback.tenantDbId || user.id,
      role: fallback.role,
    });
    const normalized = normalizeAuthUser(user, profile);
    const capabilities = getRoleCapabilities(normalized.role);

    return {
      tenantId: normalized.tenantId || fallback.tenantId,
      tenantDbId: normalized.tenantDbId || fallback.tenantDbId || user.id,
      role: normalized.role || fallback.role,
      userId: user.id,
      email: normalized.email || fallback.email,
      name: normalized.name || fallback.name || "",
      businessType: normalized.businessType || fallback.businessType || "",
      isSubscribed: normalized.isSubscribed === true,
      trialEndDate: normalized.trialEndDate || null,
      isSuperAdmin: isSuperAdminRole(normalized.role),
      authenticated: true,
      supabaseUser: user,
      profile,
      capabilities,
    };
  } catch (error) {
    console.error("[tenant] Unexpected Supabase user resolution error", error);
    return fallback;
  }
}

export function canWrite(role) {
  return canWriteOperationalData(role);
}

export function canDelete(role) {
  return canDeleteRecords(role);
}

export function canManageSensitive(role) {
  return canManageSensitiveData(role);
}

export function canSendExternal(role) {
  return canSendExternalCommunications(role);
}

export function forbiddenResponse() {
  return new Response(
    JSON.stringify({ success: false, error: "Forbidden: insufficient role" }),
    {
      status: 403,
      headers: { "Content-Type": "application/json" },
    },
  );
}

export function unauthenticatedResponse() {
  return new Response(
    JSON.stringify({ success: false, error: "Unauthenticated" }),
    {
      status: 401,
      headers: { "Content-Type": "application/json" },
    },
  );
}

function tenantQuery(tenantId) {
  if (tenantId === DEFAULT_TENANT_ID) {
    return {
      $or: [{ tenantId: DEFAULT_TENANT_ID }, { tenantId: { $exists: false } }],
    };
  }

  return { tenantId };
}

/**
 * Scope a data query to a specific tenant.
 * Pass the user's `role` as the third argument so that super_admin callers
 * receive an unscoped query and can access data across all companies.
 *
 * @param {object} baseQuery   - Your existing filter object.
 * @param {string} tenantId    - The tenant identifier from the session.
 * @param {string} [role]      - The user's role. "super_admin" bypasses scoping.
 */
export function withTenant(baseQuery, tenantId, role) {
  if ((role || "").toLowerCase() === "super_admin") {
    // Super admins see all tenants — do not inject a tenant filter.
    return baseQuery;
  }
  const scoped = tenantQuery(tenantId);
  return { ...baseQuery, ...scoped };
}
