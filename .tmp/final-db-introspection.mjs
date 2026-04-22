import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const root = process.cwd();
const envPath = path.join(root, ".env.local");
const rawEnv = fs.readFileSync(envPath, "utf8");
for (const line of rawEnv.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const index = trimmed.indexOf("=");
  if (index === -1) continue;
  const key = trimmed.slice(0, index).trim();
  const value = trimmed.slice(index + 1);
  if (!(key in process.env)) process.env[key] = value;
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) throw new Error("Missing Supabase configuration");

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const tableProbes = {
  appointments: ["id", "tenant_id", "title", "client", "date", "time", "status"],
  jobs: ["id", "tenant_id", "title", "client_id", "client_name", "status", "price"],
  clients: ["id", "tenant_id", "name", "company", "lead_status", "estimate_sent"],
  estimates: ["id", "tenant_id", "user_id"],
  estimate_builder: ["id", "tenant_id", "user_id", "name", "total_final"],
  invoices: ["id", "tenant_id", "invoice_number", "client_name", "amount", "status"],
};

const report = { generatedAt: new Date().toISOString(), tables: {}, limitations: [] };

for (const [table, columns] of Object.entries(tableProbes)) {
  const selectList = columns.join(",");
  const probe = await supabase.from(table).select(selectList).limit(1);
  report.tables[table] = {
    ok: !probe.error,
    error: probe.error?.message || null,
    hasTenantId: !probe.error || !String(probe.error?.message || "").includes("tenant_id"),
    probedColumns: columns,
    rows: probe.data || [],
  };
}

report.limitations.push("PostgREST service-role access cannot query information_schema or pg_catalog in this environment, so live RLS flags and policy definitions could not be read directly.");

const outPath = path.join(root, ".tmp", "final-db-introspection.json");
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(outPath);
