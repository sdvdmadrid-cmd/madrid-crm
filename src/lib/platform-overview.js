import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { filterRowsWithTenantId, rowHasTenantId } from "@/lib/tenant-row-guard";

function toTenantId(value) {
  return String(value || "default").trim() || "default";
}

function toNumber(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roleFromUser(user) {
  return String(
    user?.app_metadata?.role || user?.user_metadata?.role || "viewer",
  ).toLowerCase();
}

function tenantFromUser(user) {
  return toTenantId(
    user?.app_metadata?.tenant_id ||
      user?.app_metadata?.tenantId ||
      user?.user_metadata?.tenant_id ||
      user?.user_metadata?.tenantId,
  );
}

export async function listAllAuthUsers() {
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

const PLATFORM_ROW_CAP = Number(process.env.PLATFORM_OVERVIEW_ROW_CAP || 25000);

async function readTenantRows(table, columns) {
  const { data, error } = await supabaseAdmin
    .from(table)
    .select(columns)
    .limit(PLATFORM_ROW_CAP);
  if (error) return { rows: [], truncated: false };
  const rows = data || [];
  return {
    rows,
    truncated: rows.length >= PLATFORM_ROW_CAP,
  };
}

/**
 * Cross-tenant platform metrics for super_admin dashboards.
 */
export async function buildPlatformOverview() {
    const [users, clientsPack, jobsPack, invoicesPack, contractsPack] =
    await Promise.all([
      listAllAuthUsers(),
      readTenantRows("clients", "tenant_id"),
      readTenantRows("jobs", "tenant_id"),
      readTenantRows("invoices", "tenant_id,amount,paid_amount,balance_due"),
      readTenantRows("contracts", "tenant_id"),
    ]);

    const clientsRows = filterRowsWithTenantId(clientsPack.rows);
    const jobsRows = filterRowsWithTenantId(jobsPack.rows);
    const invoicesRows = filterRowsWithTenantId(invoicesPack.rows);
    const contractsRows = filterRowsWithTenantId(contractsPack.rows);
    const metricsTruncated =
      clientsPack.truncated ||
      jobsPack.truncated ||
      invoicesPack.truncated ||
      contractsPack.truncated;

  const tenantMap = new Map();
  const usersByRole = {};
  const activeCutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const activeTenants = new Set();

  const ensureTenant = (tenantId) => {
    const key = toTenantId(tenantId);
    if (!tenantMap.has(key)) {
      tenantMap.set(key, {
        tenantId: key,
        users: 0,
        admins: 0,
        contractors: 0,
        viewers: 0,
        superAdmins: 0,
        clients: 0,
        jobs: 0,
        invoices: 0,
        contracts: 0,
        totalRevenue: 0,
        paidRevenue: 0,
        balanceDue: 0,
        lastActivityAt: null,
      });
    }
    return tenantMap.get(key);
  };

  for (const user of users) {
    const tenantStats = ensureTenant(tenantFromUser(user));
    const roleKey = roleFromUser(user);

    tenantStats.users += 1;
    if (roleKey === "admin" || roleKey === "owner") tenantStats.admins += 1;
    if (roleKey === "contractor") tenantStats.contractors += 1;
    if (roleKey === "viewer") tenantStats.viewers += 1;
    if (roleKey === "super_admin") tenantStats.superAdmins += 1;

    usersByRole[roleKey] = (usersByRole[roleKey] || 0) + 1;

    const activityDate = new Date(
      user.last_sign_in_at || user.updated_at || user.created_at || 0,
    );
    if (!Number.isNaN(activityDate.getTime())) {
      if (
        !tenantStats.lastActivityAt ||
        activityDate > tenantStats.lastActivityAt
      ) {
        tenantStats.lastActivityAt = activityDate;
      }
      if (activityDate.getTime() >= activeCutoff) {
        activeTenants.add(tenantStats.tenantId);
      }
    }
  }

  for (const row of clientsRows) {
    ensureTenant(row.tenant_id).clients += 1;
  }

  for (const row of jobsRows) {
    ensureTenant(row.tenant_id).jobs += 1;
  }

  for (const row of contractsRows) {
    ensureTenant(row.tenant_id).contracts += 1;
  }

  for (const row of invoicesRows) {
    const target = ensureTenant(row.tenant_id);
    target.invoices += 1;
    target.totalRevenue += toNumber(row.amount);
    target.paidRevenue += toNumber(row.paid_amount);
    target.balanceDue += toNumber(row.balance_due);
  }

  const tenants = Array.from(tenantMap.values())
    .map((tenant) => ({
      ...tenant,
      totalRevenue: Number(tenant.totalRevenue.toFixed(2)),
      paidRevenue: Number(tenant.paidRevenue.toFixed(2)),
      balanceDue: Number(tenant.balanceDue.toFixed(2)),
      lastActivityAt: tenant.lastActivityAt
        ? tenant.lastActivityAt.toISOString()
        : null,
    }))
    .sort((a, b) => b.users - a.users || a.tenantId.localeCompare(b.tenantId));

  const summary = {
    totalTenants: tenants.length,
    totalUsers: users.length,
    totalContractors: usersByRole.contractor || 0,
    totalAdmins: (usersByRole.admin || 0) + (usersByRole.owner || 0),
    activeTenants30d: activeTenants.size,
    totalClients: tenants.reduce((sum, tenant) => sum + tenant.clients, 0),
    totalJobs: tenants.reduce((sum, tenant) => sum + tenant.jobs, 0),
    totalInvoices: tenants.reduce((sum, tenant) => sum + tenant.invoices, 0),
    totalContracts: tenants.reduce(
      (sum, tenant) => sum + tenant.contracts,
      0,
    ),
    totalRevenue: Number(
      tenants.reduce((sum, tenant) => sum + tenant.totalRevenue, 0).toFixed(2),
    ),
    paidRevenue: Number(
      tenants.reduce((sum, tenant) => sum + tenant.paidRevenue, 0).toFixed(2),
    ),
    balanceDue: Number(
      tenants.reduce((sum, tenant) => sum + tenant.balanceDue, 0).toFixed(2),
    ),
    usersByRole,
  };

  return { summary, tenants, users, metricsTruncated };
}

function parseContractorRole(user) {
  return String(
    user?.app_metadata?.role || user?.user_metadata?.role || "contractor",
  ).toLowerCase();
}

function computeContractorStatus(user) {
  const raw = String(
    user?.user_metadata?.status || user?.app_metadata?.status || "",
  ).toLowerCase();
  if (["active", "trial", "expired"].includes(raw)) return raw;

  const created = new Date(user?.created_at || 0).getTime();
  if (!Number.isFinite(created) || created <= 0) return "trial";
  const ageDays = (Date.now() - created) / (1000 * 60 * 60 * 24);
  return ageDays > 30 ? "active" : "trial";
}

async function readEstimateCountsByUser() {
  const { data, error } = await supabaseAdmin
    .from("estimates")
    .select("tenant_id");
  if (error) {
    console.error("[platform-overview] estimates query error", error);
    return {};
  }

  return (data || []).reduce((acc, row) => {
    if (!rowHasTenantId(row)) return acc;
    const key = String(row.tenant_id).trim();
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function serializeContractorUser(user, estimateCount) {
  const businessType = String(
    user?.user_metadata?.businessType || user?.user_metadata?.industry || "",
  ).trim();

  return {
    _id: user.id,
    tenantId: tenantFromUser(user),
    name: String(user?.user_metadata?.name || "").trim(),
    email: String(user?.email || "").trim(),
    companyName: String(user?.user_metadata?.companyName || "").trim(),
    businessType,
    industry: businessType,
    role: parseContractorRole(user),
    status: computeContractorStatus(user),
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

/**
 * Contractor-focused metrics (legacy /api/admin/overview shape).
 */
export async function buildContractorAdminOverview() {
  const [allUsers, estimateMap] = await Promise.all([
    listAllAuthUsers(),
    readEstimateCountsByUser(),
  ]);

  const users = allUsers
    .filter((user) => parseContractorRole(user) === "contractor")
    .map((user) => serializeContractorUser(user, estimateMap[user.id] || 0));

  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

  const overview = {
    totalContractors: users.length,
    activeUsers: users.filter((u) => u.status === "active").length,
    trialUsers: users.filter((u) => u.status === "trial").length,
    expiredUsers: users.filter((u) => u.status === "expired").length,
    totalEstimates: users.reduce((s, u) => s + u.estimateCount, 0),
    inactiveUsers: users.filter(
      (u) => !u.lastLoginAt || new Date(u.lastLoginAt).getTime() < sevenDaysAgo,
    ).length,
  };

  const mostActive = [...users]
    .sort((a, b) => b.estimateCount - a.estimateCount)
    .slice(0, 5);

  return { overview, users, mostActive };
}
