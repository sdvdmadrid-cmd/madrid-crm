#!/usr/bin/env node
/**
 * Re-import Jobber CSV rows using "update existing" semantics (non-destructive).
 *
 * Usage:
 *   node scripts/jobber/csv-update-clients.mjs <path-to.csv> [tenant_id]
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { buildClientUpdateRow } from "../../src/lib/client-records.js";
import {
  buildImportClientUpdateBody,
  mapRecordToClientPayload,
  normalizeEmailForMatch,
  normalizePhoneForMatch,
  validateClientImportPayload,
} from "../../src/lib/import-engine/client-import-validate.js";
import { parseCsvText } from "../../src/lib/import-engine/csv-parse.js";
import { detectImportProvider } from "../../src/lib/import-engine/providers/index.js";
import { loadJobberEnv, defaultTenantId } from "./_env.mjs";

loadJobberEnv();

const csvPath = process.argv[2];
const tenantId = process.argv[3] || defaultTenantId();

if (!csvPath) {
  console.error("Usage: node scripts/jobber/csv-update-clients.mjs <csv-file> [tenant_id]");
  process.exit(1);
}

const { rows: records } = parseCsvText(readFileSync(csvPath, "utf8"));
if (!records.length) {
  console.error("CSV has no data rows.");
  process.exit(1);
}

const provider = detectImportProvider(records[0]);
const mapping = {};
console.log(`Detected import provider: ${provider}`);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function loadMatchIndex() {
  const emailToClient = new Map();
  const phoneToClient = new Map();
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from("clients")
      .select("id, name, email, phone")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) throw new Error(error.message);

    for (const row of data || []) {
      const emailKey = normalizeEmailForMatch(row.email);
      if (emailKey && !emailToClient.has(emailKey)) {
        emailToClient.set(emailKey, { id: row.id, name: row.name || "" });
      }
      const phoneKey = normalizePhoneForMatch(row.phone);
      if (phoneKey && !phoneToClient.has(phoneKey)) {
        phoneToClient.set(phoneKey, { id: row.id, name: row.name || "" });
      }
    }

    if ((data || []).length < pageSize) break;
    from += pageSize;
  }

  return { emailToClient, phoneToClient };
}

function findExisting(payload, index) {
  const emailKey = normalizeEmailForMatch(payload.email);
  if (emailKey && index.emailToClient.has(emailKey)) {
    return index.emailToClient.get(emailKey);
  }
  const phoneKey = normalizePhoneForMatch(payload.phone);
  if (phoneKey && index.phoneToClient.has(phoneKey)) {
    return index.phoneToClient.get(phoneKey);
  }
  return null;
}

const index = await loadMatchIndex();

const summary = {
  total: records.length,
  updated: 0,
  skippedNoMatch: 0,
  skippedInvalid: 0,
  skippedEmpty: 0,
  errors: [],
};

for (let i = 0; i < records.length; i += 1) {
  const payload = mapRecordToClientPayload(records[i], mapping);
  const validation = validateClientImportPayload(payload);
  if (!validation.ok) {
    summary.skippedInvalid += 1;
    continue;
  }

  const partial = buildImportClientUpdateBody(validation.payload);
  if (!Object.keys(partial).length) {
    summary.skippedEmpty += 1;
    continue;
  }

  const existing = findExisting(validation.payload, index);
  if (!existing?.id) {
    summary.skippedNoMatch += 1;
    continue;
  }

  const updateBody = buildClientUpdateRow(partial);
  const { error } = await supabase
    .from("clients")
    .update({
      ...updateBody,
      updated_at: new Date().toISOString(),
    })
    .eq("id", existing.id)
    .eq("tenant_id", tenantId);

  if (error) {
    summary.errors.push(`Row ${i + 2}: ${error.message}`);
    continue;
  }

  summary.updated += 1;
}

console.log(JSON.stringify({ tenantId, provider, summary }, null, 2));

if (summary.errors.length) {
  process.exit(2);
}
