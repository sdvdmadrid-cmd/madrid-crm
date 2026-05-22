import {
  buildContractorAdminOverview,
  buildPlatformOverview,
} from "@/lib/platform-overview";
import { getAuthenticatedTenantContext } from "@/lib/tenant";

/**
 * Legacy path — returns contractor metrics plus platform summary.
 * Prefer GET /api/platform/overview for new integrations.
 */
export async function GET(request) {
  try {
    const { role, authenticated } = await getAuthenticatedTenantContext(request);
    if (!authenticated || role !== "super_admin") {
      return new Response(
        JSON.stringify({ success: false, error: "Forbidden" }),
        {
          status: 403,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const [contractorData, platformData] = await Promise.all([
      buildContractorAdminOverview(),
      buildPlatformOverview(),
    ]);

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          overview: contractorData.overview,
          users: contractorData.users,
          mostActive: contractorData.mostActive,
          platform: platformData.summary,
          tenants: platformData.tenants,
        },
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          Deprecation: "true",
          Link: '</api/platform/overview>; rel="successor-version"',
        },
      },
    );
  } catch (error) {
    console.error("[api/admin/overview] error", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
