import {
  getApiResponseCache,
  setApiResponseCache,
} from "@/lib/api-response-cache";
import { buildWorkspaceContext } from "@/lib/platform-tenant";
import { getRoleCapabilities, normalizeAppRole } from "@/lib/access-control";

const WORKSPACE_CACHE_TTL_SECONDS = 120;

function workspaceCacheKey(tenantDbId, role) {
  return `auth-me-workspace:${tenantDbId || "none"}:${normalizeAppRole(role)}`;
}

/** Attach canonical platform vs tenant workspace to /api/auth/me payloads. */
export async function enrichAuthMeData(base = {}) {
  const role = normalizeAppRole(base.role);
  const cacheKey = workspaceCacheKey(base.tenantDbId, role);
  let workspace = await getApiResponseCache(cacheKey);

  if (!workspace) {
    workspace = await buildWorkspaceContext({
      authenticated: true,
      userId: base.userId,
      tenantId: base.tenantId,
      tenantDbId: base.tenantDbId,
      email: base.email,
      name: base.name,
      companyName: base.companyName,
      role,
      isSuperAdmin: role === "super_admin",
    });
    await setApiResponseCache(cacheKey, workspace, WORKSPACE_CACHE_TTL_SECONDS);
  }

  const tenantCompanyName = workspace.tenant?.companyName || "";

  return {
    ...base,
    role,
    capabilities: base.capabilities || getRoleCapabilities(role),
    companyName: tenantCompanyName || base.companyName || "",
    workspace,
  };
}

export function authReconcileCacheKey(userId) {
  return `auth-reconcile:${userId}`;
}

export const AUTH_RECONCILE_CACHE_TTL_SECONDS = 300;
