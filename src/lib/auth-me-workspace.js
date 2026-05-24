import { buildWorkspaceContext } from "@/lib/platform-tenant";
import { getRoleCapabilities, normalizeAppRole } from "@/lib/access-control";

/** Attach canonical platform vs tenant workspace to /api/auth/me payloads. */
export async function enrichAuthMeData(base = {}) {
  const role = normalizeAppRole(base.role);
  const workspace = await buildWorkspaceContext({
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

  const tenantCompanyName = workspace.tenant?.companyName || "";

  return {
    ...base,
    role,
    capabilities: base.capabilities || getRoleCapabilities(role),
    companyName: tenantCompanyName || base.companyName || "",
    workspace,
  };
}
