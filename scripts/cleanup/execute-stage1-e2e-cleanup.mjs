#!/usr/bin/env node
/**
 * Execute Stage 1 cleanup — E2E tenant ONLY.
 * Tenant: 8354b6d2-0c6c-4a95-a16d-3bbb6908c943
 */
import { writeFileSync } from "node:fs";
import { mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { loadEnvLocal } from "../load-env-local.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "../..");

const STAGE1 = "8354b6d2-0c6c-4a95-a16d-3bbb6908c943";
const TENANT_WHERE = "tenant_id::text = $1";
const REAL = {
  madrid: "d38fec7b-adac-4b7f-a46d-2ccadab6e452",
  jms: "ebb368d8-248d-4986-8fdd-56a4da7a33d8",
  susy: "6785ddd8-d0a7-4afd-a97e-1ad9f8e377a4",
};
const REAL_EXPECT = {
  [REAL.madrid]: { clients: 64, invoices: 1 },
  [REAL.jms]: { clients: 1, invoices: 0 },
  [REAL.susy]: { clients: 0, invoices: 0 },
};

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
  "estimate_items",
  "job_daily_reports",
  "email_logs",
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
    query_timeout: 300_000,
  };
}

async function countTenant(client, table, tenantId) {
  try {
    const col = await client.query(
      `SELECT data_type FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1 AND column_name = 'tenant_id'`,
      [table],
    );
    if (col.rows.length === 0) {
      if (table === "estimate_items") {
        const { rows } = await client.query(
          `SELECT count(*)::bigint AS cnt FROM public.estimate_items
           WHERE estimate_id IN (SELECT id FROM public.estimates WHERE ${TENANT_WHERE})`,
          [tenantId],
        );
        return Number(rows[0]?.cnt || 0);
      }
      if (table === "job_files") {
        const { rows } = await client.query(
          `SELECT count(*)::bigint AS cnt FROM public.job_files
           WHERE job_id IN (SELECT id FROM public.jobs WHERE ${TENANT_WHERE})`,
          [tenantId],
        );
        return Number(rows[0]?.cnt || 0);
      }
      return null;
    }
    const q = `SELECT count(*)::bigint AS cnt FROM public."${table.replace(/"/g, '""')}" WHERE ${TENANT_WHERE}`;
    const { rows } = await client.query(q, [tenantId]);
    return Number(rows[0]?.cnt || 0);
  } catch {
    return null;
  }
}

async function countGlobal(client, table) {
  const q = `SELECT count(*)::bigint AS cnt FROM public."${table.replace(/"/g, '""')}"`;
  const { rows } = await client.query(q);
  return Number(rows[0]?.cnt || 0);
}

async function snapshot(client, label, tenantId) {
  const global = {};
  const stage1 = {};
  for (const t of OVERVIEW_TABLES) {
    global[t] = await countGlobal(client, t);
    stage1[t] = await countTenant(client, t, tenantId);
  }
  const extended = {};
  for (const t of EXTENDED_TABLES) {
    extended[t] = await countTenant(client, t, tenantId);
  }
  const real = {};
  for (const [key, tid] of Object.entries(REAL)) {
    real[key] = {
      tenant_id: tid,
      clients: await countTenant(client, "clients", tid),
      jobs: await countTenant(client, "jobs", tid),
      estimates: await countTenant(client, "estimates", tid),
      invoices: await countTenant(client, "invoices", tid),
      payments: await countTenant(client, "payments", tid),
    };
  }
  const { rows: revRows } = await client.query(
    `SELECT coalesce(sum(amount),0)::numeric AS total,
            coalesce(sum(paid_amount),0)::numeric AS paid
     FROM public.invoices`,
  );
  return {
    phase: label,
    at: new Date().toISOString(),
    global_overview: global,
    stage1_tenant: stage1,
    stage1_extended: extended,
    real_tenants: real,
    invoice_revenue: {
      total: Number(revRows[0]?.total || 0),
      paid: Number(revRows[0]?.paid || 0),
    },
  };
}

async function tableExists(client, name) {
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = $1`,
    [name],
  );
  return rows.length > 0;
}

async function deleteStage1(client, tenantId) {
  const tid = tenantId;
  const steps = [];
  let sp = 0;

  async function run(label, sql, params = [], { optional = false } = {}) {
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
      throw new Error(`${label}: ${err.message.split("\n")[0]}`);
    }
  }

  await run(
    "bill_payment_remittance_queue",
    `DELETE FROM public.bill_payment_remittance_queue
     WHERE bill_id IN (SELECT id FROM public.bills WHERE ${TENANT_WHERE})`,
    [STAGE1],
  );
  await run(
    "bill_payment_transactions",
    `DELETE FROM public.bill_payment_transactions WHERE ${TENANT_WHERE}`,
    [STAGE1],
  );
  await run("bills", `DELETE FROM public.bills WHERE ${TENANT_WHERE}`, [STAGE1]);
  await run(
    "bill_payment_methods",
    `DELETE FROM public.bill_payment_methods WHERE ${TENANT_WHERE}`,
    [STAGE1],
  );
  await run(
    "bill_payment_customers",
    `DELETE FROM public.bill_payment_customers WHERE ${TENANT_WHERE}`,
    [STAGE1],
  );
  await run("email_logs", `DELETE FROM public.email_logs WHERE ${TENANT_WHERE}`, [STAGE1]);
  await run("payments", `DELETE FROM public.payments WHERE ${TENANT_WHERE}`, [STAGE1]);
  await run(
    "job_files",
    `DELETE FROM public.job_files WHERE job_id IN (SELECT id FROM public.jobs WHERE ${TENANT_WHERE})`,
    [STAGE1],
  );
  await run("job_expenses", `DELETE FROM public.job_expenses WHERE ${TENANT_WHERE}`, [STAGE1]);
  if (await tableExists(client, "job_cost_entries")) {
    await run(
      "job_cost_entries",
      `DELETE FROM public.job_cost_entries WHERE ${TENANT_WHERE}`,
      [STAGE1],
      { optional: true },
    );
  }
  if (await tableExists(client, "job_cost_summaries")) {
    await run(
      "job_cost_summaries",
      `DELETE FROM public.job_cost_summaries WHERE ${TENANT_WHERE}`,
      [STAGE1],
      { optional: true },
    );
  }
  if (await tableExists(client, "job_labor_entries")) {
    await run(
      "job_labor_entries",
      `DELETE FROM public.job_labor_entries WHERE ${TENANT_WHERE}`,
      [STAGE1],
      { optional: true },
    );
  }
  await run(
    "job_daily_reports",
    `DELETE FROM public.job_daily_reports WHERE ${TENANT_WHERE}`,
    [STAGE1],
  );
  await run("notifications", `DELETE FROM public.notifications WHERE ${TENANT_WHERE}`, [STAGE1]);
  await run("appointments", `DELETE FROM public.appointments WHERE ${TENANT_WHERE}`, [STAGE1]);
  await run(
    "estimate_revisions",
    `DELETE FROM public.estimate_revisions WHERE ${TENANT_WHERE}`,
    [STAGE1],
  );
  await run(
    "estimate_items",
    `DELETE FROM public.estimate_items WHERE estimate_id IN (
       SELECT id FROM public.estimates WHERE ${TENANT_WHERE}
     )`,
    [STAGE1],
  );
  await run("invoices", `DELETE FROM public.invoices WHERE ${TENANT_WHERE}`, [STAGE1]);
  await run("jobs", `DELETE FROM public.jobs WHERE ${TENANT_WHERE}`, [STAGE1]);
  await run("estimates", `DELETE FROM public.estimates WHERE ${TENANT_WHERE}`, [STAGE1]);
  await run("contracts", `DELETE FROM public.contracts WHERE ${TENANT_WHERE}`, [STAGE1]);
  await run("quotes", `DELETE FROM public.quotes WHERE ${TENANT_WHERE}`, [STAGE1]);
  await run(
    "estimate_builder",
    `DELETE FROM public.estimate_builder WHERE ${TENANT_WHERE}`,
    [STAGE1],
  );
  await run(
    "contractor_website_leads",
    `DELETE FROM public.contractor_website_leads WHERE ${TENANT_WHERE}`,
    [STAGE1],
  );
  if (await tableExists(client, "website_media")) {
    await run(
      "website_media",
      `DELETE FROM public.website_media WHERE website_id IN (
         SELECT id FROM public.contractor_websites WHERE ${TENANT_WHERE}
       )`,
      [STAGE1],
    );
  }
  await run(
    "contractor_websites",
    `DELETE FROM public.contractor_websites WHERE ${TENANT_WHERE}`,
    [STAGE1],
  );
  await run("vendors", `DELETE FROM public.vendors WHERE ${TENANT_WHERE}`, [STAGE1]);
  await run("clients", `DELETE FROM public.clients WHERE ${TENANT_WHERE}`, [STAGE1]);

  return steps;
}

function assertRealUnchanged(before, after) {
  for (const [key, tid] of Object.entries(REAL)) {
    const b = before.real_tenants[key];
    const a = after.real_tenants[key];
    for (const metric of ["clients", "jobs", "estimates", "invoices", "payments"]) {
      if (b[metric] !== a[metric]) {
        throw new Error(
          `Real tenant ${key} (${tid}) ${metric} changed: ${b[metric]} -> ${a[metric]}`,
        );
      }
    }
    const exp = REAL_EXPECT[tid];
    if (exp && a.clients !== exp.clients) {
      throw new Error(`Madrid/JMS client guard failed for ${key}: ${a.clients}`);
    }
  }
}

async function main() {
  loadEnvLocal(root);
  const client = new pg.Client(buildConfig());
  await client.connect();

  const report = {
    stage1_tenant_id: STAGE1,
    executed_at: new Date().toISOString(),
    status: "pending",
  };

  try {
    await client.query("BEGIN");

    const madridPre = await countTenant(client, "clients", REAL.madrid);
    const jmsPre = await countTenant(client, "clients", REAL.jms);
    if (madridPre !== 64) throw new Error(`Pre-flight: Madrid clients ${madridPre}, expected 64`);
    if (jmsPre !== 1) throw new Error(`Pre-flight: JMS clients ${jmsPre}, expected 1`);

    report.before = await snapshot(client, "before", STAGE1);
    report.delete_steps = await deleteStage1(client, STAGE1);
    report.after = await snapshot(client, "after", STAGE1);

    for (const t of OVERVIEW_TABLES) {
      const remaining = report.after.stage1_tenant[t];
      if (remaining !== 0) {
        throw new Error(`Stage1 tenant still has ${remaining} rows in ${t}`);
      }
    }

    assertRealUnchanged(report.before, report.after);

    await client.query("COMMIT");
    report.status = "committed";
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* transaction may already be aborted */
    }
    report.status = "rolled_back";
    report.error = err.message;
    throw err;
  } finally {
    await client.end();
    const outDir = resolve(root, ".local-secrets/backups");
    mkdirSync(outDir, { recursive: true });
    const outPath = resolve(
      outDir,
      `stage1-cleanup-report-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.json`,
    );
    writeFileSync(outPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ ...report, report_path: outPath }, null, 2));
  }
}

main().catch((err) => {
  console.error("[stage1-cleanup] FAILED:", err.message);
  process.exit(1);
});
