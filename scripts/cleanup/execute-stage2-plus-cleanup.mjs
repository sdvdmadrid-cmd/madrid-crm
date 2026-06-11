#!/usr/bin/env node
/**
 * Stage 2+ CRM cleanup — verified non-production tenants only.
 * Loads allowlist from latest full-production-audit JSON.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { loadEnvLocal } from "../load-env-local.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "../..");
const TENANT_WHERE = "tenant_id::text = $1";

const PROTECTED = new Set([
  "d38fec7b-adac-4b7f-a46d-2ccadab6e452",
  "ebb368d8-248d-4986-8fdd-56a4da7a33d8",
  "6785ddd8-d0a7-4afd-a97e-1ad9f8e377a4",
  "sdvdmadrid-1",
  "madridsan84",
  "susymadrid75",
  "8354b6d2-0c6c-4a95-a16d-3bbb6908c943", // E2E shell preserved
  "f2b3986e-5727-4731-b702-ec3575f1b804",
  "7e5d1b7b-80f7-4791-9dbe-649edbb9e69f",
  "platform",
  "tenant-admin",
]);

const REAL_EXPECT = {
  "d38fec7b-adac-4b7f-a46d-2ccadab6e452": { clients: 64, invoices: 1 },
  "ebb368d8-248d-4986-8fdd-56a4da7a33d8": { clients: 1, invoices: 0 },
  "6785ddd8-d0a7-4afd-a97e-1ad9f8e377a4": { clients: 0, invoices: 0 },
};

const PROTECTED_EMAILS = new Set([
  "sdvdmadrid@gmail.com",
  "madridsan84@yahoo.com",
  "susymadrid75@gmail.com",
  "owner@fieldbaseapp.net",
]);

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
    statement_timeout: 600_000,
  };
}

function latestAuditPath() {
  const dir = resolve(root, ".local-secrets/backups");
  const files = readdirSync(dir)
    .filter((f) => f.startsWith("full-production-audit-") && f.endsWith(".json"))
    .sort()
    .reverse();
  if (!files.length) throw new Error("No audit JSON found — run full-production-audit.mjs first");
  return resolve(dir, files[0]);
}

async function tableExists(client, name) {
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`,
    [name],
  );
  return rows.length > 0;
}

async function deleteTenantCrm(client, tenantId) {
  const steps = [];
  let sp = 0;
  async function run(label, sql, params = [], optional = false) {
    const savepoint = `sp_${++sp}`;
    await client.query(`SAVEPOINT ${savepoint}`);
    try {
      const res = await client.query(sql, params);
      await client.query(`RELEASE SAVEPOINT ${savepoint}`);
      steps.push({ step: label, deleted: res.rowCount ?? 0 });
    } catch (err) {
      await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
      await client.query(`RELEASE SAVEPOINT ${savepoint}`);
      if (optional) {
        steps.push({ step: label, skipped: true, reason: err.message.split("\n")[0] });
        return;
      }
      throw new Error(`${tenantId} ${label}: ${err.message.split("\n")[0]}`);
    }
  }

  const tid = tenantId;
  await run("bill_payment_remittance_queue", `DELETE FROM public.bill_payment_remittance_queue WHERE bill_id IN (SELECT id FROM public.bills WHERE ${TENANT_WHERE})`, [tid]);
  await run("bill_payment_transactions", `DELETE FROM public.bill_payment_transactions WHERE ${TENANT_WHERE}`, [tid]);
  await run("bills", `DELETE FROM public.bills WHERE ${TENANT_WHERE}`, [tid]);
  await run("bill_payment_methods", `DELETE FROM public.bill_payment_methods WHERE ${TENANT_WHERE}`, [tid]);
  await run("bill_payment_customers", `DELETE FROM public.bill_payment_customers WHERE ${TENANT_WHERE}`, [tid]);
  await run("email_logs", `DELETE FROM public.email_logs WHERE ${TENANT_WHERE}`, [tid]);
  await run("payments", `DELETE FROM public.payments WHERE ${TENANT_WHERE}`, [tid]);
  await run("job_files", `DELETE FROM public.job_files WHERE job_id IN (SELECT id FROM public.jobs WHERE ${TENANT_WHERE})`, [tid]);
  await run("job_expenses", `DELETE FROM public.job_expenses WHERE ${TENANT_WHERE}`, [tid]);
  await run("job_daily_reports", `DELETE FROM public.job_daily_reports WHERE ${TENANT_WHERE}`, [tid], true);
  await run("notifications", `DELETE FROM public.notifications WHERE ${TENANT_WHERE}`, [tid]);
  await run("appointments", `DELETE FROM public.appointments WHERE ${TENANT_WHERE}`, [tid]);
  await run("estimate_revisions", `DELETE FROM public.estimate_revisions WHERE ${TENANT_WHERE}`, [tid]);
  await run("estimate_items", `DELETE FROM public.estimate_items WHERE estimate_id IN (SELECT id FROM public.estimates WHERE ${TENANT_WHERE})`, [tid], true);
  await run("invoices", `DELETE FROM public.invoices WHERE ${TENANT_WHERE}`, [tid]);
  await run("jobs", `DELETE FROM public.jobs WHERE ${TENANT_WHERE}`, [tid]);
  await run("estimates", `DELETE FROM public.estimates WHERE ${TENANT_WHERE}`, [tid]);
  await run("contracts", `DELETE FROM public.contracts WHERE ${TENANT_WHERE}`, [tid]);
  await run("quotes", `DELETE FROM public.quotes WHERE ${TENANT_WHERE}`, [tid]);
  await run("estimate_builder", `DELETE FROM public.estimate_builder WHERE ${TENANT_WHERE}`, [tid]);
  await run("contractor_website_leads", `DELETE FROM public.contractor_website_leads WHERE ${TENANT_WHERE}`, [tid]);
  if (await tableExists(client, "website_media")) {
    await run("website_media", `DELETE FROM public.website_media WHERE website_id IN (SELECT id FROM public.contractor_websites WHERE ${TENANT_WHERE})`, [tid], true);
  }
  await run("contractor_websites", `DELETE FROM public.contractor_websites WHERE ${TENANT_WHERE}`, [tid]);
  await run("vendors", `DELETE FROM public.vendors WHERE ${TENANT_WHERE}`, [tid], true);
  await run("product_feedback", `DELETE FROM public.product_feedback WHERE ${TENANT_WHERE}`, [tid], true);
  await run("clients", `DELETE FROM public.clients WHERE ${TENANT_WHERE}`, [tid]);
  await run("company_profiles", `DELETE FROM public.company_profiles WHERE tenant_id::text = $1`, [tid], true);
  await run("audit_logs", `DELETE FROM public.audit_logs WHERE ${TENANT_WHERE}`, [tid], true);

  return steps;
}

async function count(client, table, tenantId) {
  try {
    const { rows } = await client.query(
      `SELECT count(*)::int AS n FROM public."${table}" WHERE ${TENANT_WHERE}`,
      [tenantId],
    );
    return rows[0].n;
  } catch {
    return null;
  }
}

async function platformSnapshot(client) {
  const tables = ["clients", "jobs", "estimates", "invoices", "payments", "contracts"];
  const global = {};
  for (const t of tables) {
    const { rows } = await client.query(`SELECT count(*)::int AS n FROM public.${t}`);
    global[t] = rows[0].n;
  }
  const { rows: rev } = await client.query(
    `SELECT coalesce(sum(amount),0)::numeric AS total, coalesce(sum(paid_amount),0)::numeric AS paid FROM public.invoices`,
  );
  global.invoice_revenue_total = Number(rev[0].total);
  global.invoice_revenue_paid = Number(rev[0].paid);

  const real = {};
  for (const [tid, exp] of Object.entries(REAL_EXPECT)) {
    real[tid] = {
      clients: await count(client, "clients", tid),
      invoices: await count(client, "invoices", tid),
      expected: exp,
    };
  }
  return { global, real };
}

async function authEmailForTenant(client, tenantId) {
  const { rows } = await client.query(
    `SELECT email FROM auth.users WHERE
       COALESCE(raw_app_meta_data->>'tenant_id', raw_app_meta_data->>'tenantId',
                raw_user_meta_data->>'tenant_id', raw_user_meta_data->>'tenantId', id::text) = $1
     LIMIT 1`,
    [tenantId],
  );
  return rows[0]?.email || null;
}

async function main() {
  loadEnvLocal(root);
  const auditPath = latestAuditPath();
  const audit = JSON.parse(readFileSync(auditPath, "utf8"));
  const allowlist = audit.removable_tenant_ids || [];

  for (const id of allowlist) {
    if (PROTECTED.has(id)) throw new Error(`Allowlist contains protected tenant: ${id}`);
  }

  const client = new pg.Client(buildConfig());
  await client.connect();

  const report = {
    audit_source: auditPath,
    executed_at: new Date().toISOString(),
    allowlist_count: allowlist.length,
    tenants_cleaned: [],
    status: "pending",
  };

  try {
    await client.query("BEGIN");
    report.before = await platformSnapshot(client);

    for (const [tid, exp] of Object.entries(REAL_EXPECT)) {
      const c = report.before.real[tid]?.clients;
      const i = report.before.real[tid]?.invoices;
      if (c !== exp.clients || i !== exp.invoices) {
        throw new Error(`Pre-flight REAL tenant ${tid}: clients=${c} invoices=${i}, expected ${exp.clients}/${exp.invoices}`);
      }
    }

    for (const tenantId of allowlist) {
      const email = await authEmailForTenant(client, tenantId);
      if (email && PROTECTED_EMAILS.has(email.toLowerCase())) {
        throw new Error(`Blocked cleanup for tenant ${tenantId} — protected email ${email}`);
      }
      const steps = await deleteTenantCrm(client, tenantId);
      report.tenants_cleaned.push({ tenant_id: tenantId, email, steps });
    }

    report.after = await platformSnapshot(client);
    for (const [tid, exp] of Object.entries(REAL_EXPECT)) {
      const c = report.after.real[tid]?.clients;
      const i = report.after.real[tid]?.invoices;
      if (c !== exp.clients || i !== exp.invoices) {
        throw new Error(`Post-check REAL tenant ${tid} changed: clients=${c} invoices=${i}`);
      }
    }

    await client.query("COMMIT");
    report.status = "committed";
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* noop */
    }
    report.status = "rolled_back";
    report.error = err.message;
    throw err;
  } finally {
    await client.end();
    const dir = resolve(root, ".local-secrets/backups");
    mkdirSync(dir, { recursive: true });
    const out = resolve(dir, `stage2-cleanup-report-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.json`);
    writeFileSync(out, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ ...report, report_path: out }, null, 2));
  }
}

main().catch((err) => {
  console.error("[stage2-cleanup] FAILED:", err.message);
  process.exit(1);
});
