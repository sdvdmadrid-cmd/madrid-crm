import { NextResponse } from "next/server";
import { verifySessionToken } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

const SESSION_COOKIE_NAME =
  process.env.NODE_ENV === "production"
    ? "__Host-madrid_session"
    : "madrid_session";

function normalizeRole(session) {
  return String(session?.role || "").toLowerCase();
}

export async function GET(request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value || "";
    const session = verifySessionToken(token);

    if (!session || normalizeRole(session) !== "super_admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Get all platform fees
    const { data: fees, error: feesError } = await supabaseAdmin
      .from("bill_payment_platform_fees")
      .select(
        "id,tenant_id,user_id,charge_month,amount,status,charged_at,failed_at,failure_reason,created_at"
      )
      .order("created_at", { ascending: false });

    if (feesError) {
      throw new Error(feesError.message);
    }

    // Get tenant and user info for context
    const tenantIds = [...new Set((fees || []).map((f) => f.tenant_id))];
    const userIds = [...new Set((fees || []).map((f) => f.user_id))];

    const [{ data: tenants }, { data: users }] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("id,email,name")
        .in("id", tenantIds.length > 0 ? tenantIds : [null]),
      supabaseAdmin.auth.admin.listUsers(),
    ]);

    const tenantMap = new Map((tenants || []).map((t) => [t.id, t]));
    const userMap = new Map();
    (users?.users || []).forEach((u) => {
      userMap.set(u.id, {
        email: u.email,
        name: u.user_metadata?.name || u.email,
      });
    });

    // Enrich fees with tenant/user info
    const enrichedFees = (fees || []).map((fee) => ({
      ...fee,
      tenantEmail: tenantMap.get(fee.tenant_id)?.email,
      tenantName: tenantMap.get(fee.tenant_id)?.name,
      userName: userMap.get(fee.user_id)?.name,
    }));

    // Calculate statistics
    const today = new Date();
    const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;

    const currentMonthFees = enrichedFees.filter(
      (f) => f.charge_month === currentMonth
    );

    const chargedCount = currentMonthFees.filter(
      (f) => f.status === "paid"
    ).length;
    const totalCharged = currentMonthFees
      .filter((f) => f.status === "paid")
      .reduce((sum, f) => sum + Number(f.amount || 0), 0);

    const pendingCount = currentMonthFees.filter(
      (f) => f.status === "processing"
    ).length;
    const pendingAmount = currentMonthFees
      .filter((f) => f.status === "processing")
      .reduce((sum, f) => sum + Number(f.amount || 0), 0);

    const failedCount = currentMonthFees.filter(
      (f) => f.status === "failed"
    ).length;
    const failedAmount = currentMonthFees
      .filter((f) => f.status === "failed")
      .reduce((sum, f) => sum + Number(f.amount || 0), 0);

    // Total all-time
    const totalAllTimeRevenue = enrichedFees
      .filter((f) => f.status === "paid")
      .reduce((sum, f) => sum + Number(f.amount || 0), 0);
    const totalAllTimeChargedCount = enrichedFees.filter(
      (f) => f.status === "paid"
    ).length;

    // Group by month for breakdown
    const monthMap = new Map();
    enrichedFees.forEach((fee) => {
      if (!monthMap.has(fee.charge_month)) {
        monthMap.set(fee.charge_month, {
          chargeMonth: fee.charge_month,
          chargedCount: 0,
          totalCharged: 0,
          pendingCount: 0,
          totalPending: 0,
          failedCount: 0,
          failedAmount: 0,
        });
      }
      const month = monthMap.get(fee.charge_month);
      if (fee.status === "paid") {
        month.chargedCount += 1;
        month.totalCharged += Number(fee.amount || 0);
      } else if (fee.status === "processing") {
        month.pendingCount += 1;
        month.totalPending += Number(fee.amount || 0);
      } else if (fee.status === "failed") {
        month.failedCount += 1;
        month.failedAmount += Number(fee.amount || 0);
      }
    });

    const monthlyBreakdown = Array.from(monthMap.values()).sort(
      (a, b) =>
        new Date(`${b.chargeMonth}-01`).getTime() -
        new Date(`${a.chargeMonth}-01`).getTime()
    );

    // Get failed charges for detail view
    const failedCharges = enrichedFees
      .filter((f) => f.status === "failed")
      .sort((a, b) => new Date(b.failedAt).getTime() - new Date(a.failedAt).getTime());

    return NextResponse.json({
      success: true,
      data: {
        currentMonth: {
          chargedCount,
          totalCharged,
          pendingCount,
          pendingAmount,
          failedCount,
          failedAmount,
        },
        totalAllTimeRevenue,
        totalAllTimeChargedCount,
        monthlyBreakdown,
        failedCharges: failedCharges.slice(0, 50), // Limit to 50 for UI
      },
    });
  } catch (error) {
    console.error("[admin/platform-fees] Error:", error);
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}
