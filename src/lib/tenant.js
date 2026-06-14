import {
  canDeleteRecords,
  canManageSensitiveData,
  canReadTenantData,
  canSendExternalCommunications,
  canWriteOperationalData,
  getRoleCapabilities,
  isSuperAdminRole,
  normalizeAppRole,
} from "@/lib/access-control";
import { getSessionFromRequest } from "@/lib/auth";
import { applyComplimentarySessionFields } from "@/lib/complimentary-access";
import {
  getSupabaseUserFromRequest,
  normalizeAuthUser,
  resolveProfileForUser,
} from "@/lib/supabase-auth";
import {
  isSubscriptionBypassPath,
  SUBSCRIPTION_ALLOWED_API_PREFIXES,
  SUBSCRIPTION_ALLOWED_PAGE_PREFIXES,
} from "@/lib/subscription-access-core";
import { requireBusinessAccess } from "@/lib/subscription-access";

function isBusinessApiPath(request) {
  try {
    const pathname = new URL(request.url).pathname;
    if (!pathname.startsWith("/api/")) return false;
    return !isSubscriptionBypassPath(
      pathname,
      SUBSCRIPTION_ALLOWED_API_PREFIXES,
      SUBSCRIPTION_ALLOWED_PAGE_PREFIXES,
    );
  } catch {
    return false;
  }
}

async function enforceBusinessAccessForRequest(request, context) {
  if (!request || !context?.authenticated || !isBusinessApiPath(request)) {
    return context;
  }
  const { blocked } = await requireBusinessAccess(context);
  if (blocked) {
    return { ...context, subscriptionBlockedResponse: blocked };
  }
  return context;
}

export function getSubscriptionBlockedResponse(context) {
  return context?.subscriptionBlockedResponse || null;
}

export function rejectIfSubscriptionBlocked(context) {
  return getSubscriptionBlockedResponse(context);
}

export function getTenantContext(request) {
  const session = getSessionFromRequest(request);
  if (session?.tenantId) {
    const normalizedRole = normalizeAppRole(session.role);
    const capabilities = getRoleCapabilities(normalizedRole);
    return applyComplimentarySessionFields({
      tenantId: session.tenantId,
      tenantDbId: session.tenantDbId || session.userId || null,
      role: normalizedRole,
      userId: session.userId || "system",
      email: session.email || null,
      name: session.name || "",
      companyName: session.companyName || "",
      businessType: session.businessType || session.industry || "",
      isSubscribed: session.isSubscribed === true,
      billPaymentsSubscribed: session.billPaymentsSubscribed === true,
      trialEndDate: session.trialEndDate || null,
      isAdmin: capabilities.isAdmin,
      isSuperAdmin: isSuperAdminRole(normalizedRole),
      authenticated: true,
      capabilities,
    });
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
    billPaymentsSubscribed: false,
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
      return enforceBusinessAccessForRequest(request, fallback);
    }

    if (!user?.id) {
      return enforceBusinessAccessForRequest(request, fallback);
    }

    const profile = await resolveProfileForUser(user, {
      tenantId: fallback.tenantDbId || user.id,
      role: fallback.role,
    });
    const normalized = normalizeAuthUser(user, profile);
    const capabilities = getRoleCapabilities(normalized.role);

    return enforceBusinessAccessForRequest(
      request,
      applyComplimentarySessionFields({
        tenantId: normalized.tenantId || fallback.tenantId,
        tenantDbId: normalized.tenantDbId || fallback.tenantDbId || user.id,
        role: normalized.role || fallback.role,
        userId: user.id,
        email: normalized.email || fallback.email,
        name: normalized.name || fallback.name || "",
        businessType: normalized.businessType || fallback.businessType || "",
        isSubscribed: normalized.isSubscribed === true,
        billPaymentsSubscribed: normalized.billPaymentsSubscribed === true,
        trialEndDate: normalized.trialEndDate || null,
        isAdmin: capabilities.isAdmin,
        isSuperAdmin: isSuperAdminRole(normalized.role),
        authenticated: true,
        supabaseUser: user,
        profile,
        capabilities,
      }),
    );
  } catch (error) {
    console.error("[tenant] Unexpected Supabase user resolution error", error);
    return enforceBusinessAccessForRequest(request, fallback);
  }
}

export function canRead(role) {
  return canReadTenantData(role);
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

/**
 * @deprecated Legacy Mongo-style helper — unused with Supabase.
 * Use `scopeByTenant()` from `@/lib/tenant-scope` on PostgREST query builders.
 */
export function withTenant(baseQuery, tenantId, role) {
  if (isSuperAdminRole(role)) {
    return baseQuery;
  }
  return { ...baseQuery, tenantId };
}

// Re-export the pure derived-row tenant resolver from its own module
// so the unit test in tests/unit/resolve-insert-tenant.test.mjs can
// import it without pulling in the full auth / Supabase tree that
// the rest of this file depends on. Routes can continue to import it
// from "@/lib/tenant" alongside the auth helpers.
export { resolveInsertTenant } from "@/lib/tenant-insert";
