import "server-only";

import {
  buildClientInsertRow,
  buildClientUpdateRow,
} from "@/lib/client-records";
import {
  classifyImportRow,
  mapRecordToClientPayload,
  normalizeEmailForMatch,
  normalizePhoneForMatch,
  validateClientImportPayload,
} from "@/lib/import-engine/client-import-validate";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const IMPORT_BATCH_SIZE = 100;
export const IMPORT_PREVIEW_LIMIT = 500;
export const IMPORT_MAX_ROWS = 10_000;

/**
 * Load tenant client email/phone keys for duplicate detection.
 */
export async function loadTenantClientMatchIndex(tenantId) {
  const emailToClient = new Map();
  const phoneToClient = new Map();

  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabaseAdmin
      .from("clients")
      .select("id, name, email, phone")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) throw new Error(error.message);

    const rows = data || [];
    for (const row of rows) {
      const emailKey = normalizeEmailForMatch(row.email);
      if (emailKey && !emailToClient.has(emailKey)) {
        emailToClient.set(emailKey, { id: row.id, name: row.name || "" });
      }
      const phoneKey = normalizePhoneForMatch(row.phone);
      if (phoneKey && !phoneToClient.has(phoneKey)) {
        phoneToClient.set(phoneKey, { id: row.id, name: row.name || "" });
      }
    }

    if (rows.length < pageSize) break;
    from += pageSize;
  }

  return { emailToClient, phoneToClient };
}

function findExistingInIndex(payload, index) {
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

/**
 * Preview import rows with duplicate + validation classification.
 */
export async function previewClientImport({
  tenantId,
  records,
  mapping,
  duplicateMode = "skip",
}) {
  const index = await loadTenantClientMatchIndex(tenantId);
  const seenEmails = new Set();
  const seenPhones = new Set();

  const preview = [];
  const summary = {
    total: records.length,
    ready: 0,
    duplicateExisting: 0,
    duplicateFile: 0,
    invalid: 0,
    willCreate: 0,
    willUpdate: 0,
    willSkip: 0,
  };

  for (let rowIndex = 0; rowIndex < records.length; rowIndex += 1) {
    const record = records[rowIndex];
    const payload = mapRecordToClientPayload(record, mapping);
    const validation = validateClientImportPayload(payload);

    const emailKey = normalizeEmailForMatch(payload.email);
    const phoneKey = normalizePhoneForMatch(payload.phone);
    let duplicateInFile = false;

    if (emailKey) {
      if (seenEmails.has(emailKey)) duplicateInFile = true;
      else seenEmails.add(emailKey);
    }
    if (phoneKey) {
      if (seenPhones.has(phoneKey)) duplicateInFile = true;
      else seenPhones.add(phoneKey);
    }

    const existingClient = validation.ok
      ? findExistingInIndex(payload, index)
      : null;

    const row = classifyImportRow({
      rowIndex,
      validation,
      duplicateInFile,
      existingClient,
    });

    preview.push({ ...row, duplicateMode });

    if (row.status === "invalid") {
      summary.invalid += 1;
    } else if (row.status === "duplicate_file") {
      summary.duplicateFile += 1;
      summary.willSkip += 1;
    } else if (row.status === "duplicate_existing") {
      summary.duplicateExisting += 1;
      if (duplicateMode === "update") {
        summary.willUpdate += 1;
      } else if (duplicateMode === "create") {
        summary.willCreate += 1;
      } else {
        summary.willSkip += 1;
      }
    } else {
      summary.ready += 1;
      summary.willCreate += 1;
    }
  }

  return { preview, summary };
}

/**
 * Commit a batch of CSV records (caller chunks to IMPORT_BATCH_SIZE).
 */
export async function commitClientImportBatch({
  tenantId,
  userId,
  records,
  mapping,
  duplicateMode = "skip",
  startRowIndex = 0,
  seenKeys = null,
}) {
  const index = await loadTenantClientMatchIndex(tenantId);
  const seenEmails = new Set(
    Array.isArray(seenKeys?.emails) ? seenKeys.emails : [],
  );
  const seenPhones = new Set(
    Array.isArray(seenKeys?.phones) ? seenKeys.phones : [],
  );

  const result = {
    created: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  const inserts = [];

  for (let offset = 0; offset < records.length; offset += 1) {
    const rowIndex = startRowIndex + offset;
    const record = records[offset];
    const payload = mapRecordToClientPayload(record, mapping);
    const validation = validateClientImportPayload(payload);

    const emailKey = normalizeEmailForMatch(payload.email);
    const phoneKey = normalizePhoneForMatch(payload.phone);

    if (emailKey && seenEmails.has(emailKey)) {
      result.skipped += 1;
      result.errors.push({
        rowIndex,
        message: "Skipped: duplicate email within CSV",
      });
      continue;
    }
    if (phoneKey && seenPhones.has(phoneKey)) {
      result.skipped += 1;
      result.errors.push({
        rowIndex,
        message: "Skipped: duplicate phone within CSV",
      });
      continue;
    }
    if (emailKey) seenEmails.add(emailKey);
    if (phoneKey) seenPhones.add(phoneKey);

    if (!validation.ok) {
      result.failed += 1;
      result.errors.push({
        rowIndex,
        message: validation.errors.join("; "),
      });
      continue;
    }

    const existing = findExistingInIndex(payload, index);

    if (existing) {
      if (duplicateMode === "skip") {
        result.skipped += 1;
        continue;
      }

      if (duplicateMode === "update") {
        try {
          const updateRow = buildClientUpdateRow({
            name: payload.name,
            email: payload.email,
            phone: payload.phone,
            address: payload.address,
            city: payload.city,
            state: payload.state,
            zip: payload.zip,
            company: payload.company,
            notes: payload.notes,
          });

          const { error } = await supabaseAdmin
            .from("clients")
            .update(updateRow)
            .eq("id", existing.id)
            .eq("tenant_id", tenantId);

          if (error) throw error;
          result.updated += 1;

          if (emailKey) index.emailToClient.set(emailKey, existing);
          if (phoneKey) index.phoneToClient.set(phoneKey, existing);
        } catch (err) {
          result.failed += 1;
          result.errors.push({
            rowIndex,
            message: err?.message || "Update failed",
          });
        }
        continue;
      }
      // duplicateMode === "create" falls through to insert
    }

    try {
      const insertRow = buildClientInsertRow(payload, { tenantId, userId });
      inserts.push({ rowIndex, insertRow, emailKey, phoneKey });
    } catch (err) {
      result.failed += 1;
      result.errors.push({
        rowIndex,
        message: err?.message || "Invalid row",
      });
    }
  }

  if (inserts.length > 0) {
    const insertPayload = inserts.map((item) => item.insertRow);
    const { error } = await supabaseAdmin.from("clients").insert(insertPayload);

    if (error) {
      for (const item of inserts) {
        const { data: inserted, error: rowError } = await supabaseAdmin
          .from("clients")
          .insert(item.insertRow)
          .select("id, name")
          .maybeSingle();

        if (rowError) {
          result.failed += 1;
          result.errors.push({
            rowIndex: item.rowIndex,
            message: rowError.message,
          });
          continue;
        }

        result.created += 1;
        const clientRef = {
          id: inserted?.id || "pending",
          name: inserted?.name || item.insertRow.name,
        };
        if (item.emailKey) index.emailToClient.set(item.emailKey, clientRef);
        if (item.phoneKey) index.phoneToClient.set(item.phoneKey, clientRef);
      }
    } else {
      result.created += inserts.length;
      for (const item of inserts) {
        const clientRef = { id: "pending", name: item.insertRow.name };
        if (item.emailKey) index.emailToClient.set(item.emailKey, clientRef);
        if (item.phoneKey) index.phoneToClient.set(item.phoneKey, clientRef);
      }
    }
  }

  return {
    ...result,
    seenKeys: {
      emails: [...seenEmails],
      phones: [...seenPhones],
    },
  };
}
