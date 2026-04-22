import {
  getCompanyProfileByTenant,
  upsertCompanyProfileForTenant,
} from "@/lib/company-profile-store";
import {
  canWrite,
  forbiddenResponse,
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";

function normalizeKeyList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, 500);
}

function normalizePreferences(value) {
  if (!value || typeof value !== "object") {
    return { favorites: [], manualOrder: [] };
  }

  return {
    favorites: normalizeKeyList(value.favorites),
    manualOrder: normalizeKeyList(value.manualOrder),
  };
}

export async function GET(request) {
  try {
    const { tenantDbId, authenticated } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) {
      return unauthenticatedResponse();
    }

    const { searchParams } = new URL(request.url);
    const category = String(searchParams.get("category") || "").trim();
    if (!category) {
      return Response.json(
        { success: false, error: "Category is required" },
        { status: 400 },
      );
    }

    const profile = await getCompanyProfileByTenant({ tenantId: tenantDbId });
    const preferences =
      profile?.serviceCatalogPreferences &&
      typeof profile.serviceCatalogPreferences === "object"
        ? profile.serviceCatalogPreferences
        : {};

    return Response.json(
      {
        success: true,
        data: normalizePreferences(preferences[category]),
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("[api/services-catalog/preferences][GET] error", error);
    return Response.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }
}

export async function PATCH(request) {
  try {
    const { tenantDbId, role, userId, authenticated } =
      await getAuthenticatedTenantContext(request);
    if (!authenticated) {
      return unauthenticatedResponse();
    }
    if (!canWrite(role)) {
      return forbiddenResponse();
    }

    const { category, favorites, manualOrder } = await request.json();
    const normalizedCategory = String(category || "").trim();
    if (!normalizedCategory) {
      return Response.json(
        { success: false, error: "Category is required" },
        { status: 400 },
      );
    }

    const currentProfile =
      (await getCompanyProfileByTenant({ tenantId: tenantDbId })) || {};
    const currentPreferences =
      currentProfile.serviceCatalogPreferences &&
      typeof currentProfile.serviceCatalogPreferences === "object"
        ? currentProfile.serviceCatalogPreferences
        : {};

    const nextPreferences = {
      ...currentPreferences,
      [normalizedCategory]: normalizePreferences({ favorites, manualOrder }),
    };

    const saved = await upsertCompanyProfileForTenant({
      tenantId: tenantDbId,
      userId,
      profile: {
        ...currentProfile,
        serviceCatalogPreferences: nextPreferences,
      },
    });

    return Response.json(
      {
        success: true,
        data: normalizePreferences(saved.serviceCatalogPreferences?.[normalizedCategory]),
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("[api/services-catalog/preferences][PATCH] error", error);
    return Response.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }
}