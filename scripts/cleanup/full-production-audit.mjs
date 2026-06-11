#!/usr/bin/env node
/**
 * Full production tenant audit for Owner Command Center cleanup planning.
 * Read-only against production Supabase (pg direct).
 *
 * Usage:
 *   node scripts/cleanup/full-production-audit.mjs
 *   node scripts/cleanup/full-production-audit.mjs --write-report
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { loadEnvLocal } from "../load-env-local.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "../..");
const writeReport = process.argv.includes("--write-report");

/** Confirmed real businesses — NEVER classify for removal */
const PROTECTED_TENANT_IDS = new Set([
  "d38fec7b-adac-4b7f-a46d-2ccadab6e452", // Madrid Landscaping
  "ebb368d8-248d-4986-8fdd-56a4da7a33d8", // JMS ENTERPRICES LLC
  "6785ddd8-d0a7-4afd-a97e-1ad9f8e377a4", // Susy cleaning services
  // Legacy slug tenant_ids tied to real auth users (zero CRM but protected)
  "sdvdmadrid-1",
  "madridsan84",
  "susymadrid75",
]);

/** Platform operator accounts — preserve auth, no CRM cleanup needed */
const PLATFORM_OPERATOR_IDS = new Set([
  "f2b3986e-5727-4731-b702-ec3575f1b804", // owner@fieldbaseapp.net
  "7e5d1b7b-80f7-4791-9dbe-649edbb9e69f", // owner@fieldbase.local super_admin
  "platform", // dev super_admin slug
]);

/** E2E tenant — Stage 1 CRM already cleared; shell preserved for Playwright */
const E2E_TENANT_ID = "8354b6d2-0c6c-4a95-a16d-3bbb6908c943";

const OVERVIEW_TABLES = [
  "clients",
  "jobs",
  "estimates",
  "invoices",
  "payments",
  "contracts",
];

const EXTENDED_TABLES = [
  "quotes",
  "estimate_builder",
  "contractor_website_leads",
  "contractor_websites",
  "appointments",
  "vendors",
  "job_expenses",
  "notifications",
  "bills",
  "bill_payment_transactions",
  "bill_payment_methods",
  "bill_payment_customers",
  "estimate_revisions",
  "job_daily_reports",
  "email_logs",
  "product_feedback",
  "company_profiles",
  "audit_logs",
];

const TEST_EMAIL_PATTERNS = [
  /@mailinator\.com$/i,
  /@example\.com$/i,
  /\+qa@/i,
  /qa\+/i,
  /@fieldbase\.local$/i,
  /^probe-/i,
  /^test@/i,
  /^e2e/i,
];

const TEST_COMPANY_PATTERNS = [
  /^probe co$/i,
  /^qa mail$/i,
  /^e2e/i,
  /^test /i,
];

const DEMO_TENANT_PATTERNS = [
  /^11111111-1111-1111-1111-111111111111$/,
  /^00000000-/,
  /^tenant-admin$/,
  /^default$/,
];

function buildConfig() {
  const password = process.env.SUPABASE_DB_PASSWORD;
  if (!password) throw new Error("SUPABASE_DB_PASSWORD missing");
  return {
    host: "db.fhcbnupmdpphzdafmmgd.supabase.co",
    port: 5432,
    database: "postgres",
    user: "postgres",
    password,
    ssl: { rejectUnauthorized: false },
    statement_timeout: 300_000,
  };
}

function tenantWhere(alias = "") {
  const col = alias ? `${alias}.tenant_id` : "tenant_id";
  return `${col}::text = $1`;
}

async function listTenantTables(client) {
  const { rows } = await client.query(`
    SELECT table_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'tenant_id'
    GROUP BY table_name
    ORDER BY table_name
  `);
  return rows.map((r) => r.table_name);
}

async function countForTenant(client, table, tenantId) {
  try {
    const { rows } = await client.query(
      `SELECT count(*)::bigint AS cnt FROM public."${table.replace(/"/g, '""')}" WHERE ${tenantWhere()}`,
      [tenantId],
    );
    return Number(rows[0]?.cnt || 0);
  } catch {
    return null;
  }
}

async function countGlobal(client, table) {
  const { rows } = await client.query(
    `SELECT count(*)::bigint AS cnt FROM public."${table.replace(/"/g, '""')}"`,
  );
  return Number(rows[0]?.cnt || 0);
}

async function loadAuthUsers(client) {
  const { rows } = await client.query(`
    SELECT
      id::text,
      email,
      raw_app_meta_data->>'role' AS role,
      raw_user_meta_data->>'companyName' AS company,
      raw_user_meta_data->>'name' AS name,
      COALESCE(
        raw_app_meta_data->>'tenant_id',
        raw_app_meta_data->>'tenantId',
        raw_user_meta_data->>'tenant_id',
        raw_user_meta_data->>'tenantId',
        id::text
      ) AS tenant_id,
      created_at,
      last_sign_in_at
    FROM auth.users
    ORDER BY created_at
  `);
  return rows;
}

async function loadCompanyProfiles(client) {
  const { rows } = await client.query(`
    SELECT tenant_id::text, company_name, created_at
    FROM public.company_profiles
  `);
  const map = new Map();
  for (const r of rows) map.set(r.tenant_id, r);
  return map;
}

async function invoiceTotals(client, tenantId) {
  const { rows } = await client.query(
    `SELECT
       coalesce(sum(amount),0)::numeric AS total,
       coalesce(sum(paid_amount),0)::numeric AS paid
     FROM public.invoices WHERE ${tenantWhere()}`,
    [tenantId],
  );
  return {
    total: Number(rows[0]?.total || 0),
    paid: Number(rows[0]?.paid || 0),
  };
}

function classifyTenant(tenantId, ctx) {
  if (PROTECTED_TENANT_IDS.has(tenantId)) {
    return { category: "REAL", action: "preserve", reason: "Confirmed production business (protected)" };
  }
  if (PLATFORM_OPERATOR_IDS.has(tenantId)) {
    return { category: "Platform", action: "preserve", reason: "Platform operator account" };
  }
  if (tenantId === E2E_TENANT_ID || tenantId === "tenant-admin") {
    return { category: "E2E", action: "preserve_shell", reason: "Playwright/dev-login tenant (CRM cleared Stage 1)" };
  }
  if (DEMO_TENANT_PATTERNS.some((p) => p.test(tenantId))) {
    return { category: "Demo", action: "remove_crm", reason: "Demo/mock tenant id pattern" };
  }

  const auth = ctx.authByTenant.get(tenantId);
  const company = ctx.companyByTenant.get(tenantId);
  const email = auth?.email || "";
  const companyName = auth?.company || company?.company_name || "";

  if (TEST_EMAIL_PATTERNS.some((p) => p.test(email))) {
    return { category: "Test", action: "remove_crm", reason: `Test email pattern: ${email}` };
  }
  if (TEST_COMPANY_PATTERNS.some((p) => p.test(companyName))) {
    return { category: "QA", action: "remove_crm", reason: `QA company name: ${companyName}` };
  }
  if (!auth && ctx.crmTotal > 0) {
    return { category: "Orphan", action: "remove_crm", reason: "Orphan tenant id with CRM data (no auth user)" };
  }
  if (!auth && company) {
    return { category: "QA", action: "remove_crm", reason: "Orphan company profile without auth user" };
  }
  if (!auth && ctx.crmTotal === 0 && ctx.extendedTotal === 0) {
    return { category: "Orphan", action: "preserve", reason: "Orphan id with no CRM rows" };
  }
  if (auth?.role === "super_admin") {
    return { category: "Seed", action: "preserve", reason: "Super admin seed account" };
  }
  if (!auth && ctx.crmTotal === 0) {
    return { category: "Orphan", action: "preserve", reason: "Orphan id, no CRM" };
  }

  return { category: "Unknown", action: "manual_review", reason: "Unclassified — requires manual review before cleanup" };
}

async function main() {
  loadEnvLocal(root);
  const client = new pg.Client(buildConfig());
  await client.connect();

  const authUsers = await loadAuthUsers(client);
  const companyProfiles = await loadCompanyProfiles(client);

  const authByTenant = new Map();
  for (const u of authUsers) {
    const tid = String(u.tenant_id || u.id || "").trim();
    if (!authByTenant.has(tid)) authByTenant.set(tid, u);
  }

  const companyByTenant = companyProfiles;

  // Collect all tenant ids from CRM + auth + company_profiles
  const tenantIds = new Set();
  for (const t of [...OVERVIEW_TABLES, ...EXTENDED_TABLES]) {
    try {
      const { rows } = await client.query(
        `SELECT DISTINCT tenant_id::text AS tid FROM public."${t.replace(/"/g, '""')}" WHERE tenant_id IS NOT NULL`,
      );
      for (const r of rows) if (r.tid) tenantIds.add(r.tid);
    } catch {
      /* table may not exist */
    }
  }
  for (const u of authUsers) {
    const tid = String(u.tenant_id || "").trim();
    if (tid) tenantIds.add(tid);
  }
  for (const [tid] of companyProfiles) tenantIds.add(tid);

  const global = {};
  for (const t of OVERVIEW_TABLES) global[t] = await countGlobal(client, t);
  for (const t of EXTENDED_TABLES) {
    try {
      global[t] = await countGlobal(client, t);
    } catch {
      global[t] = null;
    }
  }

  const rev = await client.query(
    `SELECT coalesce(sum(amount),0)::numeric AS total, coalesce(sum(paid_amount),0)::numeric AS paid FROM public.invoices`,
  );
  global.invoice_revenue_total = Number(rev.rows[0]?.total || 0);
  global.invoice_revenue_paid = Number(rev.rows[0]?.paid || 0);

  const tenants = [];
  for (const tenantId of [...tenantIds].sort()) {
    const overview = {};
    let crmTotal = 0;
    for (const t of OVERVIEW_TABLES) {
      const n = await countForTenant(client, t, tenantId);
      overview[t] = n ?? 0;
      crmTotal += n ?? 0;
    }
    const extended = {};
    let extendedTotal = 0;
    for (const t of EXTENDED_TABLES) {
      const n = await countForTenant(client, t, tenantId);
      if (n === null) continue;
      extended[t] = n;
      if (!OVERVIEW_TABLES.includes(t)) extendedTotal += n;
    }
    const inv = await invoiceTotals(client, tenantId);
    const auth = authByTenant.get(tenantId);
    const company = companyByTenant.get(tenantId);
    const classification = classifyTenant(tenantId, {
      authByTenant,
      companyByTenant,
      crmTotal,
      extendedTotal,
    });

    tenants.push({
      tenant_id: tenantId,
      ...classification,
      email: auth?.email || null,
      role: auth?.role || null,
      company: auth?.company || company?.company_name || null,
      last_sign_in_at: auth?.last_sign_in_at || null,
      overview,
      extended,
      crm_row_total: crmTotal,
      extended_row_total: extendedTotal,
      invoice_total_usd: inv.total,
      invoice_paid_usd: inv.paid,
    });
  }

  const removable = tenants.filter((t) => t.action === "remove_crm");
  const preserved = tenants.filter((t) => t.action !== "remove_crm");

  const expectedAfter = { ...global };
  for (const t of removable) {
    for (const k of OVERVIEW_TABLES) {
      expectedAfter[k] -= t.overview[k] || 0;
    }
    for (const k of EXTENDED_TABLES) {
      if (expectedAfter[k] != null && t.extended[k] != null) {
        expectedAfter[k] -= t.extended[k];
      }
    }
    expectedAfter.invoice_revenue_total -= t.invoice_total_usd;
    expectedAfter.invoice_revenue_paid -= t.invoice_paid_usd;
  }

  const report = {
    audited_at: new Date().toISOString(),
    stage1_e2e_tenant: E2E_TENANT_ID,
    protected_tenant_ids: [...PROTECTED_TENANT_IDS],
    global_before: global,
    expected_after_stage2_crm_cleanup: expectedAfter,
    tenants,
    summary: {
      total_tenant_ids: tenants.length,
      real_protected: tenants.filter((t) => t.category === "REAL").length,
      removable_crm_tenants: removable.length,
      preserve_shell: tenants.filter((t) => t.action === "preserve_shell").length,
      manual_review: tenants.filter((t) => t.action === "manual_review").length,
      rows_to_remove: {
        clients: removable.reduce((s, t) => s + (t.overview.clients || 0), 0),
        jobs: removable.reduce((s, t) => s + (t.overview.jobs || 0), 0),
        estimates: removable.reduce((s, t) => s + (t.overview.estimates || 0), 0),
        invoices: removable.reduce((s, t) => s + (t.overview.invoices || 0), 0),
        payments: removable.reduce((s, t) => s + (t.overview.payments || 0), 0),
        contracts: removable.reduce((s, t) => s + (t.overview.contracts || 0), 0),
        invoice_revenue_usd: removable.reduce((s, t) => s + t.invoice_total_usd, 0),
      },
      real_tenant_verification: tenants
        .filter((t) => PROTECTED_TENANT_IDS.has(t.tenant_id))
        .map((t) => ({
          tenant_id: t.tenant_id,
          email: t.email,
          company: t.company,
          clients: t.overview.clients,
          invoices: t.overview.invoices,
          action: t.action,
        })),
    },
    removable_tenant_ids: removable.map((t) => t.tenant_id),
  };

  await client.end();

  if (writeReport) {
    const dir = resolve(root, ".local-secrets/backups");
    mkdirSync(dir, { recursive: true });
    const path = resolve(dir, `full-production-audit-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.json`);
    writeFileSync(path, JSON.stringify(report, null, 2));
    report.report_path = path;
  }

  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error("[full-production-audit]", err.message);
  process.exit(1);
});
