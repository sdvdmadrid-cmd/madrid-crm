import "server-only";

import {
  forbiddenResponse,
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";
import {
  calculateMRR,
  getCurrentMonthRevenue,
  getMonthlyChurn,
  getRevenueHistory,
  getTransactionHistory,
  getFinancialOverview,
} from "@/lib/financial-analytics";

/**
 * GET /api/admin/financial/overview
 *
 * Get comprehensive financial overview
 * Admin only endpoint
 */
export async function GET(request) {
  try {
    const context = await getAuthenticatedTenantContext(request);

    if (!context.authenticated) {
      return unauthenticatedResponse();
    }

    // Only allow admins
    if (!context.isAdmin) {
      return forbiddenResponse();
    }

    const searchParams = new URL(request.url).searchParams;
    const scope = searchParams.get("scope") || "overview"; // overview, current-month, history, transactions

    let data;

    switch (scope) {
      case "current-month":
        data = await getCurrentMonthRevenue();
        break;
      case "history":
        const months = parseInt(searchParams.get("months") || "12", 10);
        data = await getRevenueHistory(months);
        break;
      case "transactions":
        const limit = parseInt(searchParams.get("limit") || "50", 10);
        data = await getTransactionHistory(limit);
        break;
      case "mrr":
        data = await calculateMRR();
        break;
      default:
        data = await getFinancialOverview();
    }

    return new Response(JSON.stringify({ success: true, data }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[admin/financial] error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "Failed to fetch financial data",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
