import "server-only";

import {
  buildContractorAdminOverview,
  buildPlatformOverview,
  listAllAuthUsers,
} from "@/lib/platform-overview";
import { isPlatformTenantAccount } from "@/lib/platform-tenant-accounts";
import { summarizeOwnerLoginActivity } from "@/lib/owner-login-activity";
import { supabaseAdmin } from "@/lib/supabase-admin";

const FEEDBACK_TABLE = "product_feedback";

/**
 * Contractor login activity for owner platform dashboards.
 */
export async function loadOwnerLoginActivity() {
  const users = await listAllAuthUsers();
  return summarizeOwnerLoginActivity(users);
}

/**
 * Rows for AdminDashboardTableClient (contractor accounts + tenant metrics).
 */
export async function buildOwnerTenantCommandRows() {
  const [{ users }, { tenants }] = await Promise.all([
    buildContractorAdminOverview(),
    buildPlatformOverview(),
  ]);

  const tenantById = new Map(
    (tenants || []).map((tenant) => [tenant.tenantId, tenant]),
  );

  return (users || []).map((user) => {
    const stats =
      tenantById.get(user.tenantDbId) ||
      tenantById.get(user.tenantId) ||
      {};
    const paidRevenue = Number(stats.paidRevenue || 0);

    return {
      id: user._id,
      name: user.name,
      email: user.email,
      companyName: user.companyName,
      industry: user.industry || user.businessType || "",
      role: user.role,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
      trialEndDate: user.trialEndDate,
      status: user.status,
      isSubscribed: user.isSubscribed,
      complimentaryAccess: user.complimentaryAccess,
      totalClients: Number(stats.clients || 0),
      jobsActive: Number(stats.jobs || 0),
      revenueCents: Math.round(paidRevenue * 100),
      estimateCount: user.estimateCount,
      tenantId: user.tenantId,
      tenantDbId: user.tenantDbId,
    };
  });
}

/**
 * Support queue: product feedback enriched with contractor email/company.
 */
export async function loadOwnerSupportQueue() {
  const [feedbackResult, authUsers] = await Promise.all([
    supabaseAdmin
      .from(FEEDBACK_TABLE)
      .select(
        "id,tenant_id,user_id,feedback_type,message,current_page,status,reviewed_by,reviewed_at,created_at,updated_at",
      )
      .order("created_at", { ascending: false })
      .limit(500),
    listAllAuthUsers(),
  ]);

  if (feedbackResult.error) {
    throw new Error(feedbackResult.error.message);
  }

  const userMap = new Map();
  for (const user of authUsers) {
    if (!isPlatformTenantAccount(user)) continue;
    userMap.set(user.id, {
      email: String(user.email || "").trim(),
      companyName: String(user.user_metadata?.companyName || "").trim(),
    });
  }

  const initialRows = (feedbackResult.data || []).map((row) => {
    const profile = userMap.get(row.user_id) || {};
    return {
      ...row,
      userEmail: profile.email || "",
      companyName: profile.companyName || "",
    };
  });

  const tenants = authUsers
    .filter(isPlatformTenantAccount)
    .map((user) => ({
      id: user.id,
      label: `${user.user_metadata?.companyName || user.email || user.id}`,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return { initialRows, tenants };
}

const SECURITY_AUDIT_ACTIONS = [
  "auth.login.failed",
  "auth.login.rate_limited",
  "auth.login.blocked",
  "ai.request.failed",
  "platform.feature_flag.updated",
  "platform_feature_flag.updated",
  "legal.accepted",
];

/**
 * Security watch snapshot for owner console.
 */
export async function loadOwnerSecurityWatch() {
  const nowIso = new Date().toISOString();

  const [rateLimitsResult, auditResult] = await Promise.all([
    supabaseAdmin
      .from("auth_rate_limits")
      .select("key,count,blocked_until,expires_at,updated_at")
      .or(`blocked_until.gt.${nowIso},count.gte.5`)
      .order("updated_at", { ascending: false })
      .limit(100),
    supabaseAdmin
      .from("audit_logs")
      .select("id,user_id,tenant_id,action,metadata,created_at")
      .in("action", SECURITY_AUDIT_ACTIONS)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  const rateLimitRows = rateLimitsResult.error ? [] : rateLimitsResult.data || [];
  const auditRows = auditResult.error ? [] : auditResult.data || [];

  const blockedNow = rateLimitRows.filter((row) => {
    if (!row.blocked_until) return false;
    return new Date(row.blocked_until).getTime() > Date.now();
  });

  return {
    rateLimits: rateLimitRows,
    blockedRateLimits: blockedNow,
    auditEvents: auditRows,
    metrics: {
      blockedKeys: blockedNow.length,
      hotKeys: rateLimitRows.length,
      securityEvents: auditRows.length,
      failedLogins: auditRows.filter((r) => r.action === "auth.login.failed").length,
      aiFailures: auditRows.filter((r) => r.action === "ai.request.failed").length,
    },
    errors: {
      rateLimits: rateLimitsResult.error?.message || null,
      audit: auditResult.error?.message || null,
    },
  };
}

/**
 * Platform activity log (audit trail).
 */
export async function loadOwnerActivityLog() {
  const { data, error } = await supabaseAdmin
    .from("audit_logs")
    .select("id,user_id,tenant_id,action,metadata,created_at")
    .order("created_at", { ascending: false })
    .limit(300);

  if (error) {
    throw new Error(error.message);
  }

  return data || [];
}

/**
 * Capacity snapshot for owner reporting (no hard tenant cap in app code).
 */
export async function getOwnerCapacitySnapshot() {
  const [{ users }, { summary }] = await Promise.all([
    buildContractorAdminOverview(),
    buildPlatformOverview(),
  ]);

  return {
    contractorAccounts: users.length,
    activeContractors: users.filter((u) => u.status === "active").length,
    trialContractors: users.filter((u) => u.status === "trial").length,
    expiredContractors: users.filter((u) => u.status === "expired").length,
    platformTenants: summary.totalTenants,
    platformUsers: summary.totalUsers,
    hardUserCapConfigured: false,
    notes: [
      "No application-level max contractor limit is enforced today.",
      "Practical limits depend on Supabase Auth, database size, Vercel plan, and Stripe.",
      "Self-signup creates one owner per new tenant; additional users join via invite within the same tenant.",
    ],
  };
}
