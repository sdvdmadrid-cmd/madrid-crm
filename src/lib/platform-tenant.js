import "server-only";
import { isSuperAdminRole } from "@/lib/access-control";
import { getCompanyProfileByTenant } from "@/lib/company-profile-store";

/** Global FieldBase SaaS platform identity — never a contractor company. */
export const PLATFORM_IDENTITY = {
  name: "FieldBase",
  productName: "FieldBase",
  domain: "fieldbaseapp.net",
  supportPath: "/legal",
};

/**
 * Display name for a contractor workspace (tenant company), not the platform.
 */
export function resolveTenantCompanyDisplayName(companyProfile, fallbacks = {}) {
  const fromProfile =
    String(companyProfile?.publicDisplayName || "").trim() ||
    String(companyProfile?.companyName || "").trim();
  if (fromProfile) return fromProfile;

  return (
    String(fallbacks.companyName || "").trim() ||
    String(fallbacks.name || "").trim() ||
    "Your company"
  );
}

export function resolveWorkspaceMode(role) {
  return isSuperAdminRole(role) ? "platform" : "contractor";
}

/**
 * Canonical platform vs tenant workspace context for API + UI.
 */
export async function buildWorkspaceContext(tenantContext) {
  const mode = resolveWorkspaceMode(tenantContext?.role);
  const platform = {
    ...PLATFORM_IDENTITY,
    mode: "platform",
  };

  if (!tenantContext?.authenticated) {
    return { platform, tenant: null, mode: "anonymous" };
  }

  if (mode === "platform") {
    return {
      platform,
      tenant: null,
      mode: "platform",
      actor: {
        userId: tenantContext.userId,
        name: tenantContext.name || "",
        email: tenantContext.email || "",
        role: tenantContext.role,
      },
    };
  }

  const tenantDbId = String(tenantContext.tenantDbId || "").trim();
  let companyProfile = null;
  if (tenantDbId) {
    try {
      companyProfile = await getCompanyProfileByTenant({ tenantId: tenantDbId });
    } catch (error) {
      console.error("[platform-tenant] company profile load failed", error);
    }
  }

  const companyDisplayName = resolveTenantCompanyDisplayName(companyProfile, {
    companyName: tenantContext.companyName,
    name: tenantContext.name,
  });

  return {
    platform,
    mode: "contractor",
    tenant: {
      id: tenantDbId,
      slug: String(tenantContext.tenantId || tenantDbId).trim(),
      companyName: companyDisplayName,
      companyProfile: companyProfile
        ? {
            companyName: companyProfile.companyName || "",
            publicDisplayName: companyProfile.publicDisplayName || "",
            businessType: companyProfile.businessType || "",
            phone: companyProfile.phone || "",
            websiteUrl: companyProfile.websiteUrl || "",
            logoDataUrl: companyProfile.logoDataUrl || "",
          }
        : null,
    },
    actor: {
      userId: tenantContext.userId,
      name: tenantContext.name || "",
      email: tenantContext.email || "",
      role: tenantContext.role,
    },
  };
}
