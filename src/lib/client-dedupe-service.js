import "server-only";

import {
  buildClientUpdateRow,
  CLIENT_SELECT_COLUMNS,
} from "@/lib/client-records";
import {
  findDuplicateClientGroups,
  mergeFieldsIntoKeeper,
} from "@/lib/client-dedupe-groups";
import { supabaseAdmin } from "@/lib/supabase-admin";

const CHILD_TABLES_UUID = [
  "jobs",
  "invoices",
  "estimate_builder",
  "payments",
  "client_properties",
  "client_notes",
  "client_visits",
  "client_requests",
];

async function loadAllTenantClients(tenantId) {
  const allRows = [];
  let from = 0;
  const pageSize = 500;

  while (true) {
    const { data, error } = await supabaseAdmin
      .from("clients")
      .select(CLIENT_SELECT_COLUMNS)
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw new Error(error.message);
    const rows = data || [];
    allRows.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }

  return allRows;
}

async function reassignClientReferences(tenantId, fromId, toId) {
  const toStr = String(toId);

  for (const table of CHILD_TABLES_UUID) {
    const { error } = await supabaseAdmin
      .from(table)
      .update({ client_id: toId })
      .eq("tenant_id", tenantId)
      .eq("client_id", fromId);

    if (error) {
      console.error(`[client-dedupe] reassign ${table}`, error);
      throw new Error(error.message);
    }
  }

  const { error: quotesError } = await supabaseAdmin
    .from("quotes")
    .update({ client_id: toStr })
    .eq("tenant_id", String(tenantId))
    .eq("client_id", String(fromId));

  if (quotesError) {
    console.error("[client-dedupe] reassign quotes", quotesError);
    throw new Error(quotesError.message);
  }
}

/**
 * Preview duplicate cleanup for a tenant.
 */
export async function previewClientDuplicates(tenantId) {
  const rows = await loadAllTenantClients(tenantId);
  const { groups } = findDuplicateClientGroups(rows);

  const duplicateCount = groups.reduce(
    (sum, g) => sum + g.duplicateIds.length,
    0,
  );

  return {
    totalClients: rows.length,
    duplicateGroups: groups.length,
    duplicatesToRemove: duplicateCount,
    groups: groups.slice(0, 20).map((g) => ({
      keeperId: g.keeperId,
      keeperName: g.keeperName,
      duplicateCount: g.duplicateIds.length,
      totalInGroup: g.count,
    })),
  };
}

/**
 * Merge duplicate clients: keep best record, reassign links, delete copies.
 */
export async function removeDuplicateClients(tenantId) {
  const rows = await loadAllTenantClients(tenantId);
  const { groups } = findDuplicateClientGroups(rows);

  let merged = 0;
  let removed = 0;
  const errors = [];

  for (const group of groups) {
    const keeper = group.clients.find((c) => c.id === group.keeperId);
    const duplicates = group.clients.filter((c) => c.id !== group.keeperId);
    if (!keeper || !duplicates.length) continue;

    try {
      const mergedRow = mergeFieldsIntoKeeper(keeper, duplicates);
      const updateBody = {
        name: mergedRow.name,
        email: mergedRow.email,
        phone: mergedRow.phone,
        address: mergedRow.address,
        city: mergedRow.city,
        state: mergedRow.state,
        zip: mergedRow.zip_code,
        company: mergedRow.company,
        notes: mergedRow.notes,
        billing_address: mergedRow.billing_address,
        billing_city: mergedRow.billing_city,
        billing_state: mergedRow.billing_state,
        billing_zip: mergedRow.billing_zip,
        billing_same_as_service: mergedRow.billing_same_as_service,
      };

      const updateRow = buildClientUpdateRow(updateBody);
      const { error: updateError } = await supabaseAdmin
        .from("clients")
        .update(updateRow)
        .eq("id", keeper.id)
        .eq("tenant_id", tenantId);

      if (updateError) throw updateError;
      merged += 1;

      for (const dup of duplicates) {
        await reassignClientReferences(tenantId, dup.id, keeper.id);

        const { error: deleteError } = await supabaseAdmin
          .from("clients")
          .delete()
          .eq("id", dup.id)
          .eq("tenant_id", tenantId);

        if (deleteError) throw deleteError;
        removed += 1;
      }
    } catch (err) {
      errors.push({
        keeperId: group.keeperId,
        message: err?.message || "Failed to merge group",
      });
    }
  }

  return {
    groupsProcessed: groups.length,
    keepersUpdated: merged,
    duplicatesRemoved: removed,
    errors,
  };
}
