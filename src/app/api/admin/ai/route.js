import { supabaseAdmin } from "@/lib/supabase-admin";
import { isPlatformFeatureEnabled } from "@/lib/platform-feature-flags";
import { getAuthenticatedTenantContext } from "@/lib/tenant";

function parseRole(user) {
  return String(
    user?.app_metadata?.role || user?.user_metadata?.role || "contractor",
  ).toLowerCase();
}

function computeStatus(user) {
  const metadata = user?.user_metadata || {};
  if (metadata.isSubscribed === true) return "active";

  const raw = String(
    metadata.status || user?.app_metadata?.status || "",
  ).toLowerCase();
  if (["active", "trial", "expired"].includes(raw)) return raw;

  const now = Date.now();
  const trialEnd = metadata.trialEndDate
    ? new Date(metadata.trialEndDate).getTime()
    : 0;
  if (trialEnd > now) return "trial";
  return "expired";
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
    if (error) {
      throw new Error(error.message);
    }

    const batch = data?.users || [];
    users.push(...batch);

    if (batch.length < perPage) break;
    page += 1;
  }

  return users;
}

async function readEstimateCountsByUser() {
  const { data, error } = await supabaseAdmin
    .from("estimate_builder")
    .select("tenant_id");
  if (error) {
    console.error("[api/admin/ai] Supabase estimate_builder query error", error);
    return {};
  }

  return (data || []).reduce((acc, row) => {
    const key = String(row.tenant_id || "");
    if (!key) return acc;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function buildInsights(users, question) {
  const q = (question || "").toLowerCase();
  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

  const active = users.filter((u) => u.status === "active");
  const trial = users.filter((u) => u.status === "trial");
  const expired = users.filter((u) => u.status === "expired");
  const inactive = users.filter(
    (u) => !u.lastLoginAt || new Date(u.lastLoginAt).getTime() < sevenDaysAgo,
  );
  const byEstimates = [...users].sort(
    (a, b) => b.estimateCount - a.estimateCount,
  );

  // General overview fallback
  const overview = [
    `Platform has ${users.length} contractor(s): ${active.length} paid, ${trial.length} on trial, ${expired.length} expired.`,
    byEstimates[0]?.estimateCount > 0
      ? `Most active: ${byEstimates[0].name} (${byEstimates[0].email}) with ${byEstimates[0].estimateCount} estimate(s).`
      : "No estimates have been created yet.",
    inactive.length > 0
      ? `${inactive.length} user(s) have not logged in within the last 7 days.`
      : "All users have been active in the last 7 days.",
  ];

  if (
    (q.includes("most active") ||
      q.includes("top user") ||
      q.includes("estimates")) &&
    !q.includes("least active")
  ) {
    const top5 = byEstimates.slice(0, 5);
    if (top5.length === 0) return "No estimates have been created yet.";
    return (
      "Most active users by estimates:\n" +
      top5
        .map(
          (u, i) =>
            `${i + 1}. ${u.name} (${u.email}) — ${u.estimateCount} estimate(s), status: ${u.status}`,
        )
        .join("\n")
    );
  }

  if (
    q.includes("least active") ||
    q.includes("low usage") ||
    q.includes("not using much")
  ) {
    const bottom5 = [...users]
      .sort((a, b) => a.estimateCount - b.estimateCount)
      .slice(0, 5);
    if (bottom5.length === 0) return "No contractors found.";
    return (
      "Least active users by estimates:\n" +
      bottom5
        .map(
          (u, i) =>
            `${i + 1}. ${u.name} (${u.email}) — ${u.estimateCount} estimate(s), status: ${u.status}`,
        )
        .join("\n")
    );
  }

  if (q.includes("usage pattern") || q.includes("usage")) {
    const total = users.length;
    if (total === 0) return "No contractors registered yet.";
    const totalEst = users.reduce((s, u) => s + u.estimateCount, 0);
    const avg = total > 0 ? (totalEst / total).toFixed(1) : 0;
    const withEstimates = users.filter((u) => u.estimateCount > 0).length;
    const neverUsed = total - withEstimates;
    const power = users.filter((u) => u.estimateCount >= 5).length;
    return [
      `Total contractors: ${total}`,
      `Total estimates created: ${totalEst}`,
      `Average estimates per user: ${avg}`,
      `Users who created at least 1 estimate: ${withEstimates} (${Math.round((withEstimates / total) * 100)}%)`,
      `Users who never created an estimate: ${neverUsed}`,
      `Power users (5+ estimates): ${power}`,
      `Active (paid): ${active.length} | On trial: ${trial.length} | Expired: ${expired.length}`,
    ].join("\n");
  }

  if (
    q.includes("not using") ||
    q.includes("inactive") ||
    q.includes("not active") ||
    q.includes("no login")
  ) {
    if (inactive.length === 0)
      return "All users have logged in within the last 7 days.";
    return (
      `${inactive.length} user(s) have not logged in in 7+ days:\n` +
      inactive
        .slice(0, 10)
        .map(
          (u) =>
            `• ${u.name} (${u.email}) — last login: ${u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : "never"}`,
        )
        .join("\n")
    );
  }

  if (q.includes("trial") || q.includes("expir")) {
    if (trial.length === 0 && expired.length === 0)
      return "No users on trial or with expired accounts.";
    const lines = [];
    if (trial.length > 0) {
      lines.push(
        `On trial (${trial.length}):\n` +
          trial
            .slice(0, 5)
            .map(
              (u) =>
                `• ${u.name} (${u.email}) — expires ${u.trialEndDate ? new Date(u.trialEndDate).toLocaleDateString() : "unknown"}`,
            )
            .join("\n"),
      );
    }
    if (expired.length > 0) {
      lines.push(
        `Expired (${expired.length}):\n` +
          expired
            .slice(0, 5)
            .map((u) => `• ${u.name} (${u.email})`)
            .join("\n"),
      );
    }
    return lines.join("\n\n");
  }

  if (q.includes("paid") || q.includes("subscri") || q.includes("revenue")) {
    if (active.length === 0) return "No paid subscribers yet.";
    return (
      `${active.length} paid subscriber(s):\n` +
      active
        .slice(0, 10)
        .map((u) => `• ${u.name} (${u.email})`)
        .join("\n")
    );
  }

  if (
    q.includes("improve") ||
    q.includes("suggest") ||
    q.includes("recommendation")
  ) {
    const suggestions = [];
    if (expired.length > 0)
      suggestions.push(
        `• ${expired.length} expired user(s) — consider a re-engagement email campaign.`,
      );
    if (inactive.length > 0)
      suggestions.push(
        `• ${inactive.length} user(s) inactive 7+ days — check for onboarding issues.`,
      );
    const zeroEstimates = users.filter((u) => u.estimateCount === 0).length;
    if (zeroEstimates > 0)
      suggestions.push(
        `• ${zeroEstimates} user(s) have never created an estimate — they may need guided onboarding.`,
      );
    if (suggestions.length === 0)
      return "Platform looks healthy! All users are active and engaged.";
    return `Suggested improvements:\n${suggestions.join("\n")}`;
  }

  return overview.join("\n");
}

export async function POST(request) {
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

    const body = await request.json();
    const question = (body.question || "").trim();

    if (!question) {
      return new Response(
        JSON.stringify({ success: false, error: "Question is required" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const aiEnabled = await isPlatformFeatureEnabled("feature_admin_ai_assistant", true);
    if (!aiEnabled) {
      return new Response(
        JSON.stringify({ success: false, error: "Admin AI Assistant is currently disabled by feature flag" }),
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
      .filter((u) => parseRole(u) !== "super_admin")
      .map((u) => ({
        name: String(u?.user_metadata?.name || "").trim(),
        email: String(u?.email || "").trim(),
        status: computeStatus(u),
        trialEndDate: u?.user_metadata?.trialEndDate || null,
        lastLoginAt: u?.last_sign_in_at || null,
        estimateCount: estimateMap[u.id] || 0,
      }));

    const answer = buildInsights(users, question);

    return new Response(JSON.stringify({ success: true, data: { answer } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
