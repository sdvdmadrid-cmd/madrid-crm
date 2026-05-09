import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  forbiddenResponse,
  getAuthenticatedTenantContext,
  unauthenticatedResponse,
} from "@/lib/tenant";
import { getSubscriptionInvoices } from "@/lib/stripe-payments";

/**
 * GET /api/subscriptions/invoices
 *
 * Get subscription invoice history for the authenticated tenant
 */
export async function GET(request) {
  try {
    const context = await getAuthenticatedTenantContext(request);

    if (!context.authenticated) {
      return unauthenticatedResponse();
    }

    const invoices = await getSubscriptionInvoices(context.tenantDbId, 24);

    return new Response(
      JSON.stringify({
        success: true,
        invoices: invoices.map((inv) => ({
          id: inv.id,
          amount: inv.amount,
          currency: inv.currency,
          status: inv.status,
          periodStart: inv.period_start,
          periodEnd: inv.period_end,
          dueAt: inv.due_at,
          paidAt: inv.paid_at,
          createdAt: inv.created_at,
        })),
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[subscriptions/invoices] error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "Failed to fetch invoices",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
