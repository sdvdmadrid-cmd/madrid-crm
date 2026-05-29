#!/usr/bin/env node
/**
 * Audit imported CRM data coverage on the linked Supabase project.
 * Usage: node scripts/audit-jobber-crm-data.mjs [tenant_id]
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnvLocal } from "./load-env-local.mjs";

const root = process.cwd();
const loaded = loadEnvLocal(root);
if (!loaded.ok) {
  console.error(loaded.error);
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const tenantFilter = process.argv[2] || null;

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function scope(query, column = "tenant_id") {
  if (!tenantFilter) return query;
  return query.eq(column, tenantFilter);
}

async function countTable(table) {
  let query = supabase.from(table).select("id", { count: "exact", head: true });
  query = scope(query);
  const { count, error } = await query;
  if (error) throw new Error(`${table}: ${error.message}`);
  return count || 0;
}

async function sampleClients(limit = 10) {
  let query = supabase
    .from("clients")
    .select("id, name, email, phone, address, company, jobber_id")
    .order("updated_at", { ascending: false })
    .limit(limit);
  query = scope(query);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data || [];
}

async function integrationStatus() {
  let query = supabase
    .from("integrations")
    .select("tenant_id, provider, metadata, updated_at")
    .eq("provider", "jobber")
    .order("updated_at", { ascending: false })
    .limit(5);
  if (tenantFilter) query = query.eq("tenant_id", tenantFilter);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data || [];
}

async function clientCoverage(clientId) {
  const tables = [
    "client_properties",
    "client_notes",
    "client_visits",
    "client_requests",
    "jobs",
    "quotes",
    "invoices",
    "estimate_builder",
  ];

  const counts = {};
  for (const table of tables) {
    let query = supabase
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientId);
    if (table !== "quotes") {
      query = scope(query);
    } else {
      query = tenantFilter ? query.eq("tenant_id", String(tenantFilter)) : query;
    }
    const { count, error } = await query;
    counts[table] = error ? `ERR: ${error.message}` : count || 0;
  }
  return counts;
}

try {
  console.log("[audit-jobber-crm] Tenant filter:", tenantFilter || "(all)");

  const integration = await integrationStatus();
  console.log("\nJobber integrations:", integration.length);
  for (const row of integration) {
    console.log(
      `  tenant=${row.tenant_id} lastSync=${row.metadata?.lastSyncAt || "never"} clients=${row.metadata?.lastSyncSummary?.clients ?? "?"}`,
    );
  }

  const tables = [
    "clients",
    "client_properties",
    "client_notes",
    "client_visits",
    "client_requests",
    "jobs",
    "quotes",
    "invoices",
    "estimate_builder",
  ];

  console.log("\nTable counts:");
  for (const table of tables) {
    const count = await countTable(table);
    console.log(`  ${table}: ${count}`);
  }

  const clients = await sampleClients(5);
  console.log("\nSample clients:");
  for (const client of clients) {
    const missing = [];
    if (!client.email) missing.push("email");
    if (!client.phone) missing.push("phone");
    if (!client.address) missing.push("address");
    const linked = await clientCoverage(client.id);
    console.log(`- ${client.name} (${client.id.slice(0, 8)}…) jobber=${client.jobber_id || "—"}`);
  if (missing.length) console.log(`    missing fields: ${missing.join(", ")}`);
    console.log(`    linked: ${JSON.stringify(linked)}`);
  }

  const withJobber = clients.filter((c) => c.jobber_id).length;
  console.log(`\nSample jobber-linked: ${withJobber}/${clients.length}`);
} catch (error) {
  console.error("[audit-jobber-crm] failed:", error.message);
  process.exit(1);
}
