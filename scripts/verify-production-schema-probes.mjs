#!/usr/bin/env node
/**
 * Production schema probes beyond migration version parity.
 * Usage: node scripts/verify-production-schema-probes.mjs
 */
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
  console.error("Missing Supabase URL or service role key");
  process.exit(1);
}

const { createClient } = await import("@supabase/supabase-js");
const sb = createClient(url, key);

const probes = [
  {
    name: "get_dashboard_metrics RPC",
    run: async () => {
      const { error } = await sb.rpc("get_dashboard_metrics", {
        p_tenant_id: "00000000-0000-0000-0000-000000000001",
      });
      if (error && /function.*does not exist/i.test(error.message || "")) {
        return { ok: false, detail: error.message };
      }
      return { ok: true, detail: "callable" };
    },
  },
  {
    name: "appointments.latitude column",
    run: async () => {
      const { error } = await sb.from("appointments").select("latitude").limit(1);
      return { ok: !error, detail: error?.message || "ok" };
    },
  },
  {
    name: "jobs.due_date column",
    run: async () => {
      const { error } = await sb.from("jobs").select("due_date").limit(1);
      return { ok: !error, detail: error?.message || "ok" };
    },
  },
];

let failed = 0;
console.log("[verify-production-schema-probes]\n");
for (const probe of probes) {
  const result = await probe.run();
  const mark = result.ok ? "OK" : "FAIL";
  if (!result.ok) failed += 1;
  console.log(`  [${mark}] ${probe.name} — ${result.detail}`);
}

if (failed) {
  console.error(`\n[verify-production-schema-probes] ${failed} probe(s) failed`);
  process.exit(1);
}
console.log("\n[verify-production-schema-probes] All probes passed");
