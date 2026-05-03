import { supabaseAdmin } from "@/lib/supabase-admin";
import { getAuthenticatedTenantContext } from "@/lib/tenant";

function parseRole(user) {
  return String(
    user?.app_metadata?.role || user?.user_metadata?.role || "contractor",
  ).toLowerCase();
}

function computeStatus(user) {
  const raw = String(
    user?.user_metadata?.status || user?.app_metadata?.status || "",
  ).toLowerCase();
  if (["active", "trial", "expired"].includes(raw)) return raw;

  const created = new Date(user?.created_at || 0).getTime();
  if (!Number.isFinite(created) || created <= 0) return "trial";
  const ageDays = (Date.now() - created) / (1000 * 60 * 60 * 24);
  return ageDays > 30 ? "active" : "trial";
}

async function listAllAuthUsers() {
  const perPage = 200;
  let page = 1;
  const users = [];

  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage,
    });
    if (error) throw new Error(error.message);

    const batch = data?.users || [];
    users.push(...batch);

    if (batch.length < perPage) break;
    page += 1;
  }

  return users;
}

async function readEstimateCountsByUser() {
  const { data, error } = await supabaseAdmin
    .from("estimates")
    .select("tenant_id");
  if (error) {
    console.error("[api/admin/overview] Supabase estimates query error", error);
    return {};
  }

  return (data || []).reduce((acc, row) => {
    const key = String(row.tenant_id || "");
    if (!key) return acc;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function serializeUser(user, estimateCount) {
  const businessType = String(
    user?.user_metadata?.businessType || user?.user_metadata?.industry || "",
  ).trim();

  return {
    _id: user.id,
    name: String(user?.user_metadata?.name || "").trim(),
    email: String(user?.email || "").trim(),
    companyName: String(user?.user_metadata?.companyName || "").trim(),
    businessType,
    industry: businessType,
    role: parseRole(user),
    status: computeStatus(user),
    isSubscribed: Boolean(
      user?.user_metadata?.isSubscribed || user?.app_metadata?.isSubscribed,
    ),
    trialStartDate: user?.user_metadata?.trialStartDate || null,
    trialEndDate: user?.user_metadata?.trialEndDate || null,
    createdAt: user?.created_at || null,
    lastLoginAt: user?.last_sign_in_at || null,
    estimateCount,
  };
}

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

    const [allUsers, estimateMap] = await Promise.all([
      listAllAuthUsers(),
      readEstimateCountsByUser(),
    ]);

    const users = allUsers
      .filter((user) => parseRole(user) === "contractor")
      .map((user) => serializeUser(user, estimateMap[user.id] || 0));

    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

    const totalContractors = users.length;
    const activeUsers = users.filter((u) => u.status === "active").length;
    const trialUsers = users.filter((u) => u.status === "trial").length;
    const expiredUsers = users.filter((u) => u.status === "expired").length;
    const totalEstimates = users.reduce((s, u) => s + u.estimateCount, 0);
    const inactiveUsers = users.filter(
      (u) => !u.lastLoginAt || new Date(u.lastLoginAt).getTime() < sevenDaysAgo,
    ).length;

    const mostActive = [...users]
      .sort((a, b) => b.estimateCount - a.estimateCount)
      .slice(0, 5);

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          overview: {
            totalContractors,
            activeUsers,
            trialUsers,
            expiredUsers,
            totalEstimates,
            inactiveUsers,
          },
          users,
          mostActive,
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
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
