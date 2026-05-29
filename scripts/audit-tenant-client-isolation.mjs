#!/usr/bin/env node
/**
 * Verify client rows are isolated per tenant (no cross-tenant leakage).
 *
 * Usage:
 *   npm run audit:tenant-clients
 *   npm run audit:tenant-clients -- <tenant_id>
 *   npm run audit:tenant-clients -- --company madrid
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local
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
if (!url || !key) {
  console.error("Missing Supabase env (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function parseArgs(argv) {
  let tenantId = null;
  let companyQuery = null;
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--company" && argv[i + 1]) {
      companyQuery = String(argv[i + 1]).trim().toLowerCase();
      i += 1;
      continue;
    }
    if (!arg.startsWith("-")) {
      tenantId = arg;
    }
  }
  return { tenantId, companyQuery };
}

async function resolveTenantFilter({ tenantId, companyQuery }) {
  if (tenantId) {
    return { tenantId, label: tenantId };
  }

  if (companyQuery) {
    const { data, error } = await supabase
      .from("company_profiles")
      .select("tenant_id, company_name, public_display_name")
      .or(
        `company_name.ilike.%${companyQuery}%,public_display_name.ilike.%${companyQuery}%`,
      )
      .limit(20);
    if (error) throw new Error(error.message);
    if (!data?.length) {
      throw new Error(`No company_profiles match "${companyQuery}".`);
    }

    const { data: clientRows, error: clientErr } = await supabase
      .from("clients")
      .select("tenant_id");
    if (clientErr) throw new Error(clientErr.message);
    const clientCounts = new Map();
    for (const row of clientRows || []) {
      const tid = String(row.tenant_id || "");
      if (!tid) continue;
      clientCounts.set(tid, (clientCounts.get(tid) || 0) + 1);
    }

    const ranked = [...data].sort((a, b) => {
      const countDiff =
        (clientCounts.get(b.tenant_id) || 0) - (clientCounts.get(a.tenant_id) || 0);
      if (countDiff !== 0) return countDiff;
      const aName = String(a.public_display_name || a.company_name || "").toLowerCase();
      const bName = String(b.public_display_name || b.company_name || "").toLowerCase();
      return aName.localeCompare(bName);
    });

    if (ranked.length > 1) {
      console.warn("Multiple companies matched — using the one with the most clients:");
      for (const row of ranked.slice(0, 8)) {
        console.warn(
          `  - ${row.public_display_name || row.company_name} (${row.tenant_id}) — ${clientCounts.get(row.tenant_id) || 0} clients`,
        );
      }
    }
    const row = ranked[0];
    return {
      tenantId: row.tenant_id,
      label: row.public_display_name || row.company_name || row.tenant_id,
    };
  }

  return { tenantId: null, label: "(all tenants)" };
}

async function loadClients() {
  const { data, error } = await supabase
    .from("clients")
    .select("id, tenant_id, name, email, phone");
  if (error) throw new Error(error.message);
  return data || [];
}

async function checkCrossTenantLinks(tenantId, clientIds) {
  if (!tenantId || !clientIds.length) return [];

  const tables = [
    { table: "jobs", column: "client_id" },
    { table: "invoices", column: "client_id" },
    { table: "estimate_builder", column: "client_id" },
  ];

  const leaks = [];
  for (const { table, column } of tables) {
    const { data, error } = await supabase
      .from(table)
      .select("id, tenant_id")
      .in(column, clientIds)
      .neq("tenant_id", tenantId);
    if (error) {
      leaks.push({ table, error: error.message });
      continue;
    }
    if (data?.length) {
      leaks.push({ table, count: data.length });
    }
  }
  return leaks;
}

function summarizeByTenant(clients) {
  const counts = new Map();
  let nullTenant = 0;
  for (const row of clients) {
    if (!row.tenant_id) {
      nullTenant += 1;
      continue;
    }
    const key = String(row.tenant_id);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return { counts, nullTenant };
}

try {
  const args = parseArgs(process.argv);
  const { tenantId, label } = await resolveTenantFilter(args);

  console.log("[audit:tenant-clients] Scope:", label);
  const allClients = await loadClients();
  const { counts, nullTenant } = summarizeByTenant(allClients);

  console.log("\nClients per tenant (top 15):");
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  for (const [tid, n] of sorted.slice(0, 15)) {
    const marker = tenantId && tid === tenantId ? "  ← scoped tenant" : "";
    console.log(`  ${n.toString().padStart(4)}  ${tid}${marker}`);
  }
  if (sorted.length > 15) {
    console.log(`  … and ${sorted.length - 15} more tenants`);
  }
  console.log(`\nTotal client rows: ${allClients.length}`);
  console.log(`Distinct tenants: ${counts.size}`);
  console.log(`Rows with NULL tenant_id: ${nullTenant}`);

  if (tenantId) {
    const scoped = allClients.filter((c) => c.tenant_id === tenantId);
    const other = allClients.filter((c) => c.tenant_id && c.tenant_id !== tenantId);
    console.log(`\nScoped tenant (${tenantId}):`);
    console.log(`  Clients in tenant: ${scoped.length}`);
    console.log(`  Clients in other tenants: ${other.length}`);

    const scopedNames = new Set(
      scoped.map((c) => String(c.name || "").trim().toLowerCase()).filter(Boolean),
    );
    let nameOverlap = 0;
    for (const row of other) {
      const name = String(row.name || "").trim().toLowerCase();
      if (name && scopedNames.has(name)) nameOverlap += 1;
    }
    console.log(`  Same name also on another tenant (may be coincidence): ${nameOverlap}`);

    const clientIds = scoped.map((c) => c.id).filter(Boolean);
    const leaks = await checkCrossTenantLinks(tenantId, clientIds);
    if (!leaks.length) {
      console.log("  Cross-tenant FK leaks (jobs/invoices/estimates): none");
    } else {
      console.log("  Cross-tenant FK leaks:");
      for (const leak of leaks) {
        console.log(`    - ${leak.table}:`, leak.count ?? leak.error);
      }
    }

    if (nullTenant > 0) {
      console.error("\nFAIL: Found clients without tenant_id.");
      process.exit(1);
    }
    if (leaks.some((l) => l.count > 0)) {
      console.error("\nFAIL: Linked records point to this tenant's clients but another tenant_id.");
      process.exit(1);
    }
    console.log("\nPASS: Client list for this tenant is isolated.");
  } else {
    if (nullTenant > 0) {
      console.warn("\nWARN: Some clients have NULL tenant_id — fix before production.");
    } else {
      console.log("\nOK: Every client row has tenant_id set.");
    }
    console.log("Tip: pass a tenant_id or --company madrid to audit one business.");
  }
} catch (error) {
  console.error("[audit:tenant-clients] failed:", error.message);
  process.exit(1);
}
