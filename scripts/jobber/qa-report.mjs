#!/usr/bin/env node
/**
 * Pre-deploy QA report for Jobber CRM (data + integration status).
 * Usage: node scripts/jobber/qa-report.mjs [tenant_id]
 */
import { createClient } from "@supabase/supabase-js";
import { loadJobberEnv, defaultTenantId } from "./_env.mjs";
import { JOBBER_PROVIDER } from "../../src/lib/jobber/config.js";

loadJobberEnv();

const tenantId = process.argv[2] || defaultTenantId();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function count(table, extra = (q) => q) {
  let query = supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", table === "quotes" ? String(tenantId) : tenantId);
  query = extra(query);
  const { count: total, error } = await query;
  if (error) throw new Error(`${table}: ${error.message}`);
  return total || 0;
}

async function clientsWithContactMetadata(limit = 10) {
  const { data, error } = await supabase
    .from("clients")
    .select("id, name, email, phone, jobber_metadata")
    .eq("tenant_id", tenantId)
    .not("jobber_id", "is", null)
    .order("updated_at", { ascending: false })
    .limit(50);

  if (error) throw new Error(error.message);

  return (data || [])
    .map((row) => {
      const meta = row.jobber_metadata || {};
      const emails = Array.isArray(meta.emails) ? meta.emails.length : 0;
      const phones = Array.isArray(meta.phones) ? meta.phones.length : 0;
      return {
        id: row.id,
        name: row.name,
        email: row.email,
        phone: row.phone,
        jobberContactEmails: emails,
        jobberContactPhones: phones,
      };
    })
    .filter((row) => row.jobberContactEmails > 0 || row.jobberContactPhones > 0)
    .slice(0, limit);
}

async function clientsMissingContact(limit = 20) {
  const { data, error } = await supabase
    .from("clients")
    .select("id, name, email, phone, address, jobber_id")
    .eq("tenant_id", tenantId)
    .order("updated_at", { ascending: false })
    .limit(100);

  if (error) throw new Error(error.message);

  return (data || [])
    .filter((row) => !row.email && !row.phone)
    .slice(0, limit);
}

async function sampleLinkedClients(limit = 5) {
  const { data, error } = await supabase
    .from("clients")
    .select("id, name, email, phone, jobber_id")
    .eq("tenant_id", tenantId)
    .not("jobber_id", "is", null)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);

  const enriched = [];
  for (const client of data || []) {
    const tables = [
      "jobs",
      "quotes",
      "invoices",
      "client_properties",
      "client_notes",
      "client_visits",
      "client_requests",
      "estimate_builder",
    ];
    const linked = {};
    for (const table of tables) {
      let query = supabase
        .from(table)
        .select("id", { count: "exact", head: true })
        .eq("client_id", client.id);
      if (table === "quotes") {
        query = query.eq("tenant_id", String(tenantId));
      } else {
        query = query.eq("tenant_id", tenantId);
      }
      const { count: total } = await query;
      linked[table] = total || 0;
    }
    enriched.push({ ...client, linked });
  }
  return enriched;
}

const { data: integration } = await supabase
  .from("integrations")
  .select("metadata, expires_at, updated_at, access_token")
  .eq("tenant_id", tenantId)
  .eq("provider", JOBBER_PROVIDER)
  .maybeSingle();

const report = {
  generatedAt: new Date().toISOString(),
  tenantId,
  jobber: {
    connected: Boolean(integration?.access_token),
    lastSyncAt: integration?.metadata?.lastSyncAt || null,
    lastSyncSummary: integration?.metadata?.lastSyncSummary || null,
    tokenExpiresAt: integration?.expires_at || null,
  },
  counts: {
    clients: await count("clients"),
    clientsWithJobberId: await count("clients", (q) =>
      q.not("jobber_id", "is", null),
    ),
    properties: await count("client_properties"),
    notes: await count("client_notes"),
    jobs: await count("jobs"),
    quotes: await count("quotes"),
    invoices: await count("invoices"),
    visits: await count("client_visits"),
    requests: await count("client_requests"),
    estimates: await count("estimate_builder"),
  },
  gaps: {
    clientsMissingEmailAndPhone: await clientsMissingContact(),
  },
  samples: {
    jobberLinkedClients: await sampleLinkedClients(),
    jobberContactsInMetadata: await clientsWithContactMetadata(),
  },
  deployReady: false,
  blockers: [],
};

if (!report.jobber.connected) {
  report.blockers.push("Jobber OAuth not connected");
}
if (!report.jobber.lastSyncAt) {
  report.blockers.push("Full Jobber sync has not completed");
}
if (report.counts.clientsWithJobberId < 3) {
  report.blockers.push("Fewer than 3 clients with jobber_id");
}
if (report.gaps.clientsMissingEmailAndPhone.length > 10) {
  report.blockers.push(
    "Many recent clients still missing email and phone (CSV backfill or sync needed)",
  );
}

report.deployReady = report.blockers.length === 0;

console.log(JSON.stringify(report, null, 2));
process.exit(report.deployReady ? 0 : 2);
