#!/usr/bin/env node
/**
 * Validates production/staging Supabase schema required for Jobber CRM + clients.
 * Usage: node scripts/validate-jobber-crm-schema.mjs
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
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const REQUIRED = [
  { table: "clients", columns: ["jobber_id", "jobber_metadata"] },
  { table: "jobs", columns: ["jobber_id"] },
  { table: "quotes", columns: ["jobber_id"] },
  { table: "invoices", columns: ["jobber_id"] },
  {
    table: "estimate_builder",
    columns: ["estimate_number", "client_id", "quote_id"],
    forbidden: ["quote_number"],
  },
  { table: "client_properties", columns: ["id", "client_id", "jobber_id"] },
  { table: "client_notes", columns: ["id", "client_id", "jobber_id"] },
  { table: "client_visits", columns: ["id", "client_id", "jobber_id"] },
  { table: "client_requests", columns: ["id", "client_id", "jobber_id"] },
  { table: "integrations", columns: ["metadata"] },
];

let failures = 0;

async function probe(table, column) {
  const { error } = await supabase.from(table).select(column).limit(1);
  if (!error) return { ok: true };

  const message = String(error.message || "");
  if (/does not exist/i.test(message) || /Could not find/i.test(message)) {
    return { ok: false, message };
  }
  return { ok: true, warning: message };
}

async function probeForbidden(table, column) {
  const { error } = await supabase.from(table).select(column).limit(1);
  if (!error) {
    return { ok: false, message: `Forbidden column '${column}' is still queryable` };
  }
  const message = String(error.message || "");
  if (/does not exist/i.test(message) || /Could not find/i.test(message)) {
    return { ok: true };
  }
  return { ok: true, warning: message };
}

console.log("[validate-jobber-crm] Probing Supabase schema...\n");

for (const spec of REQUIRED) {
  for (const column of spec.columns) {
    const result = await probe(spec.table, column);
    if (result.ok) {
      console.log(`OK  ${spec.table}.${column}`);
      if (result.warning) {
        console.log(`    warn: ${result.warning}`);
      }
    } else {
      failures += 1;
      console.error(`FAIL ${spec.table}.${column} — ${result.message}`);
    }
  }

  for (const forbidden of spec.forbidden || []) {
    const result = await probeForbidden(spec.table, forbidden);
    if (result.ok) {
      console.log(`OK  ${spec.table}.${forbidden} (correctly absent)`);
    } else {
      failures += 1;
      console.error(`FAIL ${spec.table}.${forbidden} — ${result.message}`);
    }
  }
}

const smoke = await supabase
  .from("estimate_builder")
  .select("id, estimate_number, quote_id, client_id, jobber_id")
  .limit(1);

if (smoke.error) {
  failures += 1;
  console.error(`FAIL estimate_builder composite select — ${smoke.error.message}`);
} else {
  console.log("OK  estimate_builder composite select");
}

console.log("");
if (failures > 0) {
  console.error(`[validate-jobber-crm] ${failures} check(s) failed. Run migrations before deploy.`);
  process.exit(1);
}

console.log("[validate-jobber-crm] All schema checks passed.");
