import { supabaseAdmin } from "@/lib/supabase-admin";
import { getAuthenticatedTenantContext } from "@/lib/tenant";

function formatCurrency(value) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export async function GET(request) {
  try {
    const { role, authenticated } = await getAuthenticatedTenantContext(request);

    if (!authenticated || role !== "super_admin") {
      return new Response(
        JSON.stringify({ success: false, error: "Forbidden" }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      );
    }

    const { searchParams } = new URL(request.url);
    const status = String(searchParams.get("status") || "").trim().toLowerCase();
    const limit = Math.min(Math.max(Number(searchParams.get("limit") || 50), 1), 500);

    let query = supabaseAdmin
      .from("contractor_subscriptions")
      .select(
        `
        id,
        tenant_id,
        plan_id,
        stripe_subscription_id,
        status,
        trial_ends_at,
        current_period_start,
        current_period_end,
        cancelled_at,
        created_at,
        updated_at,
        subscription_plans (
          id,
          name,
          price_monthly
        ),
        tenants (
          tenant_name,
          email
        )
      `,
      )
      .order("created_at", { ascending: false })
      .limit(limit);

    if (status && ["trialing", "active", "paused", "past_due", "cancelled"].includes(status)) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(error.message);
    }

    const rows = (data || []).map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      tenantName: row.tenants?.tenant_name || "-",
      tenantEmail: row.tenants?.email || "-",
      planName: row.subscription_plans?.name || "-",
      priceMonthly: row.subscription_plans?.price_monthly || 0,
      status: row.status,
      stripeSubscriptionId: row.stripe_subscription_id || "-",
      trialEndsAt: row.trial_ends_at,
      currentPeriodStart: row.current_period_start,
      currentPeriodEnd: row.current_period_end,
      cancelledAt: row.cancelled_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));

    // Calculate statistics
    const stats = {
      total: rows.length,
      active: rows.filter((r) => r.status === "active").length,
      trialing: rows.filter((r) => r.status === "trialing").length,
      cancelled: rows.filter((r) => r.status === "cancelled").length,
      mrr: rows
        .filter((r) => ["active", "trialing"].includes(r.status))
        .reduce((sum, r) => sum + r.priceMonthly, 0),
    };

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          rows,
          stats,
          status: status || "all",
          limit,
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[api/admin/subscriptions] error", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unable to load subscriptions",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
