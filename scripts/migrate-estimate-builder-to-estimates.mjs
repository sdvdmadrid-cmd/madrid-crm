#!/usr/bin/env node
/**
 * One-time migration: copy estimate_builder rows into estimates (kanban source of truth).
 *
 * Usage:
 *   node scripts/migrate-estimate-builder-to-estimates.mjs           # dry-run (default)
 *   node scripts/migrate-estimate-builder-to-estimates.mjs --apply
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnvLocal } from "./load-env-local.mjs";
import {
  buildEstimateRowFromBuilder,
  nextNumberForTenant,
} from "../src/lib/migrate-estimate-builder-rows.js";

loadEnvLocal();

const apply = process.argv.includes("--apply");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function loadClientsById(ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const { data, error } = await supabase
    .from("clients")
    .select("id, name, email, phone, address")
    .in("id", unique);
  if (error) throw new Error(error.message);
  return new Map((data || []).map((row) => [row.id, row]));
}

async function main() {
  const { data: builderRows, error: builderError } = await supabase
    .from("estimate_builder")
    .select("*")
    .order("created_at", { ascending: true });
  if (builderError) throw new Error(builderError.message);

  const { data: pipelineRows, error: pipelineError } = await supabase
    .from("estimates")
    .select("id, tenant_id, estimate_number, legacy_builder_id");
  if (pipelineError) throw new Error(pipelineError.message);

  const byLegacyId = new Map();
  const byTenantNumber = new Map();
  const numbersByTenant = new Map();

  for (const row of pipelineRows || []) {
    if (row.legacy_builder_id) {
      byLegacyId.set(String(row.legacy_builder_id), row);
    }
    const tenant = String(row.tenant_id || "");
    const num = String(row.estimate_number || "").trim();
    if (tenant && num) {
      byTenantNumber.set(`${tenant}::${num}`, row);
    }
    if (tenant && num) {
      const list = numbersByTenant.get(tenant) || [];
      list.push(num);
      numbersByTenant.set(tenant, list);
    }
  }

  const clientIds = (builderRows || [])
    .map((row) => String(row.client_id || "").trim())
    .filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  const clientsById = await loadClientsById(clientIds);

  let linked = 0;
  let inserted = 0;
  let skipped = 0;
  const toInsert = [];
  const toLink = [];

  for (const row of builderRows || []) {
    const legacyId = String(row.id);
    if (byLegacyId.has(legacyId)) {
      skipped += 1;
      continue;
    }

    const tenantId = String(row.tenant_id || "");
    let estimateNumber = String(row.estimate_number || "").trim();
    const numberKey = tenantId && estimateNumber ? `${tenantId}::${estimateNumber}` : "";

    if (numberKey && byTenantNumber.has(numberKey)) {
      toLink.push({
        estimateId: byTenantNumber.get(numberKey).id,
        legacyBuilderId: legacyId,
      });
      linked += 1;
      continue;
    }

    if (!estimateNumber && tenantId) {
      const tenantBuilder = (builderRows || []).filter(
        (r) => String(r.tenant_id) === tenantId,
      );
      estimateNumber = nextNumberForTenant(
        numbersByTenant.get(tenantId) || [],
        tenantBuilder,
      );
      const list = numbersByTenant.get(tenantId) || [];
      list.push(estimateNumber);
      numbersByTenant.set(tenantId, list);
    }

    const client = clientsById.get(String(row.client_id || "").trim()) || null;
    toInsert.push(
      buildEstimateRowFromBuilder(row, {
        client,
        estimateNumber,
      }),
    );
    inserted += 1;
  }

  console.log(`\n[migrate-estimate-builder] Mode: ${apply ? "APPLY" : "DRY-RUN"}`);
  console.log(`  Legacy rows:     ${(builderRows || []).length}`);
  console.log(`  Link existing:   ${linked}`);
  console.log(`  Insert new:      ${inserted}`);
  console.log(`  Already done:    ${skipped}`);

  if (!apply) {
    console.log("\nRun with --apply to write changes.");
    return;
  }

  for (const link of toLink) {
    const { error } = await supabase
      .from("estimates")
      .update({ legacy_builder_id: link.legacyBuilderId })
      .eq("id", link.estimateId)
      .is("legacy_builder_id", null);
    if (error) throw new Error(error.message);
  }

  const batchSize = 50;
  for (let i = 0; i < toInsert.length; i += batchSize) {
    const chunk = toInsert.slice(i, i + batchSize);
    const { error } = await supabase.from("estimates").insert(chunk);
    if (error) throw new Error(error.message);
  }

  console.log("\n[migrate-estimate-builder] Migration applied successfully.");
}

main().catch((err) => {
  console.error("[migrate-estimate-builder] Failed:", err.message);
  process.exit(1);
});
