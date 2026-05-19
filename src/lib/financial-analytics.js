import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * Calculate Monthly Recurring Revenue (MRR)
 * MRR = total of all active subscriptions' monthly price
 */
export async function calculateMRR() {
  try {
    const { data, error } = await supabaseAdmin
      .from("contractor_subscriptions")
      .select(
        `
        id,
        subscription_plans (
          price_monthly
        )
      `,
      )
      .in("status", ["trialing", "active"]);

    if (error) throw error;

    const mrr = (data || []).reduce((sum, sub) => {
      return sum + (sub.subscription_plans?.price_monthly || 0);
    }, 0);

    return { mrr, activeSubscriptions: data?.length || 0 };
  } catch (error) {
    console.error("[calculateMRR] error:", error);
    return { mrr: 0, activeSubscriptions: 0, error: error.message };
  }
}

/**
 * Get expected revenue for current month
 */
export async function getCurrentMonthRevenue() {
  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const { data, error } = await supabaseAdmin
      .from("subscription_invoices")
      .select("amount, status, paid_at")
      .gte("period_start", monthStart.toISOString())
      .lte("period_start", monthEnd.toISOString());

    if (error) throw error;

    const totalRevenue = (data || []).reduce((sum, invoice) => {
      return sum + (invoice.amount || 0);
    }, 0);

    const paidRevenue = (data || [])
      .filter((inv) => inv.status === "paid")
      .reduce((sum, invoice) => {
        return sum + (invoice.amount || 0);
      }, 0);

    return {
      totalRevenue,
      paidRevenue,
      pendingRevenue: totalRevenue - paidRevenue,
      invoiceCount: data?.length || 0,
    };
  } catch (error) {
    console.error("[getCurrentMonthRevenue] error:", error);
    return {
      totalRevenue: 0,
      paidRevenue: 0,
      pendingRevenue: 0,
      invoiceCount: 0,
      error: error.message,
    };
  }
}

/**
 * Get subscription churn (cancellations) for the month
 */
export async function getMonthlyChurn() {
  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const { data, error } = await supabaseAdmin
      .from("contractor_subscriptions")
      .select("id, status, updated_at")
      .eq("status", "cancelled")
      .gte("updated_at", monthStart.toISOString())
      .lte("updated_at", monthEnd.toISOString());

    if (error) throw error;

    return { cancelledCount: data?.length || 0 };
  } catch (error) {
    console.error("[getMonthlyChurn] error:", error);
    return { cancelledCount: 0, error: error.message };
  }
}

/**
 * Get revenue history for the last 12 months
 */
export async function getRevenueHistory(months = 12) {
  try {
    const history = [];
    const now = new Date();

    for (let i = months - 1; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
      const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);

      const { data, error } = await supabaseAdmin
        .from("subscription_invoices")
        .select("amount, status")
        .gte("period_start", monthStart.toISOString())
        .lte("period_start", monthEnd.toISOString());

      if (error) throw error;

      const totalRevenue = (data || []).reduce((sum, invoice) => {
        return sum + (invoice.amount || 0);
      }, 0);

      const paidRevenue = (data || [])
        .filter((inv) => inv.status === "paid")
        .reduce((sum, invoice) => {
          return sum + (invoice.amount || 0);
        }, 0);

      history.push({
        month: date.toLocaleString("es-ES", { month: "short", year: "numeric" }),
        monthNum: date.getMonth() + 1,
        year: date.getFullYear(),
        totalRevenue,
        paidRevenue,
        pendingRevenue: totalRevenue - paidRevenue,
      });
    }

    return history;
  } catch (error) {
    console.error("[getRevenueHistory] error:", error);
    return [];
  }
}

/**
 * Get all transactions (invoices and payments) sorted by date
 */
export async function getTransactionHistory(limit = 50) {
  try {
    const { data, error } = await supabaseAdmin
      .from("subscription_invoices")
      .select(
        `
        id,
        created_at,
        amount,
        status,
        tenant_id
      `,
      )
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;

    return (data || []).map((inv) => ({
      id: inv.id,
      date: inv.created_at,
      amount: inv.amount,
      status: inv.status,
      tenantId: inv.tenant_id,
      type: "invoice",
    }));
  } catch (error) {
    console.error("[getTransactionHistory] error:", error);
    return [];
  }
}

/**
 * Get financial overview
 */
export async function getFinancialOverview() {
  try {
    const [mrrData, currentMonth, churnData, history] = await Promise.all([
      calculateMRR(),
      getCurrentMonthRevenue(),
      getMonthlyChurn(),
      getRevenueHistory(12),
    ]);

    return {
      mrr: mrrData.mrr,
      activeSubscriptions: mrrData.activeSubscriptions,
      currentMonth: {
        ...currentMonth,
      },
      churn: churnData.cancelledCount,
      history,
    };
  } catch (error) {
    console.error("[getFinancialOverview] error:", error);
    return {
      mrr: 0,
      activeSubscriptions: 0,
      currentMonth: {
        totalRevenue: 0,
        paidRevenue: 0,
        pendingRevenue: 0,
        invoiceCount: 0,
      },
      churn: 0,
      history: [],
      error: error.message,
    };
  }
}
