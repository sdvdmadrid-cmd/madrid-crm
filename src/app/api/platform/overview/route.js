import {
  buildPlatformOverview,
} from "@/lib/platform-overview";
import { getAuthenticatedTenantContext } from "@/lib/tenant";

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

    const { summary, tenants, metricsTruncated } = await buildPlatformOverview();

    return new Response(
      JSON.stringify({
        success: true,
        summary,
        tenants,
        metricsTruncated: metricsTruncated === true,
        data: { summary, tenants, metricsTruncated },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
