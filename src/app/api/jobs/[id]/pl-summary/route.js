import { getJobProfitRollup } from "@/lib/project-pl.js";
import {
  getAuthenticatedTenantContext,
  getSubscriptionBlockedResponse,
  unauthenticatedResponse,
} from "@/lib/tenant";

export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  try {
    const context = await getAuthenticatedTenantContext(request);
    const subscriptionBlocked = getSubscriptionBlockedResponse(context);
    if (subscriptionBlocked) return subscriptionBlocked;
    const { authenticated, tenantDbId  } = context;
        if (!authenticated) return unauthenticatedResponse();

    const { id } = await params;
    const rollup = await getJobProfitRollup(tenantDbId, id);
    if (!rollup) {
      return Response.json({ success: false, error: "Job not found" }, { status: 404 });
    }

    return Response.json({
      success: true,
      data: {
        revenue: rollup.revenue,
        actual: { totalCost: rollup.totalCost },
        profit: {
          grossProfit: rollup.grossProfit,
          marginPercent: rollup.marginPercent,
        },
        metrics: { isLosingMoney: rollup.isLosingMoney },
        breakdown: {
          labor: rollup.actualLaborBurden,
          materials: rollup.materialsCost,
          equipment: rollup.equipmentCost,
          subcontractor: rollup.subcontractorCost,
          other: rollup.otherCost,
        },
      },
    });
  } catch (error) {
    console.error("[api/jobs/:id/pl-summary][GET]", error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
