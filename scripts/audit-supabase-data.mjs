#!/usr/bin/env node
import { loadEnvLocal } from "./load-env-local.mjs";
import { createClient } from "@supabase/supabase-js";

loadEnvLocal();

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const TABLES = [
  "contractor_websites",
  "contractor_website_leads",
  "contractor_reviews",
  "contractor_social_profiles",
  "company_profiles",
  "clients",
  "jobs",
  "invoices",
  "estimates",
  "estimate_requests",
  "profiles",
];

console.log("[audit-supabase-data] Probing key tables\n");

for (const t of TABLES) {
  const { count, error } = await sb
    .from(t)
    .select("id", { count: "exact", head: true });
  if (error) {
    console.log(`  [MISS] ${t} — ${error.message}`);
  } else {
    console.log(`  [OK]   ${t} — ${count} rows`);
  }
}

const { data: pub } = await sb
  .from("contractor_websites")
  .select("slug, published, contractor_id, updated_at")
  .eq("published", true)
  .order("updated_at", { ascending: false })
  .limit(10);
console.log("\nPublished websites:");
(pub || []).forEach((w) =>
  console.log(`  - ${w.slug} (contractor ${w.contractor_id}) @ ${w.updated_at}`),
);

const { data: leads } = await sb
  .from("contractor_website_leads")
  .select("id, contractor_id, status, created_at, name")
  .order("created_at", { ascending: false })
  .limit(5);
console.log("\nRecent leads:");
(leads || []).forEach((l) =>
  console.log(
    `  - ${l.id?.slice(0, 8)} ${l.status || "?"} ${l.created_at} — ${l.name || "no name"}`,
  ),
);
