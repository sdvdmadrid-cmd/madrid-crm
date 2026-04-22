import { supabaseAdmin } from "@/lib/supabase-admin";
import { getTenantContext } from "@/lib/tenant";

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

async function readTenantRows(table, columns) {
  const { data, error } = await supabaseAdmin.from(table).select(columns);
  if (error) return [];
  return data || [];
}

export async function GET(request) {
  try {
    const { role, authenticated } = getTenantContext(request);
    if (!authenticated || role !== "super_admin") {
      return new Response(
        JSON.stringify({ success: false, error: "Forbidden" }),
        {
          status: 403,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const [users, clientsRows, jobsRows, invoicesRows, contractsRows] =
      await Promise.all([
        listAllAuthUsers(),
        readTenantRows("clients", "tenant_id"),
        readTenantRows("jobs", "tenant_id"),
        readTenantRows("invoices", "tenant_id,amount,paid_amount,balance_due"),
        readTenantRows("contracts", "tenant_id"),
      ]);

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
      .sort(
        (a, b) => b.users - a.users || a.tenantId.localeCompare(b.tenantId),
      );

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
        tenants
          .reduce((sum, tenant) => sum + tenant.totalRevenue, 0)
          .toFixed(2),
      ),
      paidRevenue: Number(
        tenants.reduce((sum, tenant) => sum + tenant.paidRevenue, 0).toFixed(2),
      ),
      balanceDue: Number(
        tenants.reduce((sum, tenant) => sum + tenant.balanceDue, 0).toFixed(2),
      ),
      usersByRole,
    };

    return new Response(
      JSON.stringify({
        success: true,
        summary,
        tenants,
        data: { summary, tenants },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
