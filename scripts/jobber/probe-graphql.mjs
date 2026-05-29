#!/usr/bin/env node
/**
 * Probe Jobber GraphQL queries with the stored access token.
 */
import { createClient } from "@supabase/supabase-js";
import { jobberGraphql } from "../../src/lib/jobber/graphql.js";
import { getValidJobberAccessToken } from "../../src/lib/jobber/oauth.js";
import {
  JOBBER_CLIENTS_QUERY,
  JOBBER_INVOICES_QUERY,
  JOBBER_JOBS_QUERY,
  JOBBER_QUOTES_QUERY,
  JOBBER_REQUESTS_QUERY,
  JOBBER_VISITS_QUERY,
} from "../../src/lib/jobber/queries.js";
import { loadJobberEnv, defaultTenantId } from "./_env.mjs";
import { JOBBER_PROVIDER } from "../../src/lib/jobber/config.js";

loadJobberEnv();

const tenantId = process.argv[2] || defaultTenantId();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: integration } = await supabase
  .from("integrations")
  .select("access_token")
  .eq("tenant_id", tenantId)
  .eq("provider", JOBBER_PROVIDER)
  .maybeSingle();

if (!integration?.access_token) {
  console.error("Jobber not connected for tenant. Run OAuth or jobber:store-tokens.");
  process.exit(1);
}

const accessToken = await getValidJobberAccessToken(tenantId);

const probes = [
  { name: "clients", query: JOBBER_CLIENTS_QUERY, path: ["clients", "nodes"] },
  { name: "jobs", query: JOBBER_JOBS_QUERY, path: ["jobs", "nodes"] },
  { name: "quotes", query: JOBBER_QUOTES_QUERY, path: ["quotes", "nodes"] },
  { name: "invoices", query: JOBBER_INVOICES_QUERY, path: ["invoices", "nodes"] },
  { name: "requests", query: JOBBER_REQUESTS_QUERY, path: ["requests", "nodes"] },
  { name: "visits", query: JOBBER_VISITS_QUERY, path: ["visits", "nodes"] },
];

const results = [];

for (const probe of probes) {
  try {
    const data = await jobberGraphql(accessToken, probe.query, {
      cursor: null,
      first: 3,
    });
    let nodes = data;
    for (const part of probe.path.slice(0, -1)) {
      nodes = nodes?.[part];
    }
    const list = nodes?.nodes || nodes;
    const count = Array.isArray(list) ? list.length : 0;
    results.push({ name: probe.name, ok: true, sampleCount: count });
  } catch (err) {
    results.push({ name: probe.name, ok: false, error: err.message });
  }
}

console.log(JSON.stringify({ tenantId, results }, null, 2));

if (results.some((row) => !row.ok)) {
  process.exit(2);
}
