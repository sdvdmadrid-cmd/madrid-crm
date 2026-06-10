/**
 * Evaluate remote RLS audit rows against repo exception allowlists.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

export function loadRlsExceptions(root = process.cwd()) {
  const path = join(root, "supabase", "security", "rls-exceptions.json");
  const raw = JSON.parse(readFileSync(path, "utf8"));
  return {
    serviceRoleOnly: new Set(
      (raw.serviceRoleOnly || []).map((t) => String(t).toLowerCase()),
    ),
    publicAccessApproved: new Set(
      (raw.publicAccessApproved || []).map((entry) =>
        String(entry.table || entry).toLowerCase(),
      ),
    ),
  };
}

function parseBool(value) {
  if (typeof value === "boolean") return value;
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "t" || normalized === "true" || normalized === "1";
}

function parseIntSafe(value) {
  const n = Number.parseInt(String(value ?? "0"), 10);
  return Number.isFinite(n) ? n : 0;
}

/**
 * @param {Record<string, string>[]} rows
 */
export function evaluateRlsAuditRows(rows, exceptions = loadRlsExceptions()) {
  const findings = [];

  for (const row of rows) {
    const table = String(row.table_name || "").toLowerCase();
    if (!table) continue;

    const rlsEnabled = parseBool(row.rls_enabled);
    const rlsForced = parseBool(row.rls_forced);
    const policyCount = parseIntSafe(row.policy_count);
    const anonPolicies = parseIntSafe(row.anon_policies);
    const authPolicies = parseIntSafe(row.authenticated_policies);
    const anonSelectGrant = parseBool(row.anon_select_grant);
    const isServiceOnly = exceptions.serviceRoleOnly.has(table);
    const isPublicApproved = exceptions.publicAccessApproved.has(table);

    if (!rlsEnabled) {
      findings.push({
        severity: "critical",
        code: "rls_disabled",
        table,
        message: `public.${table} has RLS disabled — PostgREST/anon key can read/write.`,
      });
      continue;
    }

    if (policyCount === 0 && !isServiceOnly) {
      findings.push({
        severity: "high",
        code: "rls_no_policies",
        table,
        message:
          `public.${table} has RLS enabled but zero policies. ` +
          "Add tenant policies or list the table in supabase/security/rls-exceptions.json (serviceRoleOnly).",
      });
    }

    if (anonPolicies > 0 && !isPublicApproved) {
      findings.push({
        severity: "medium",
        code: "anon_policy_unapproved",
        table,
        message:
          `public.${table} has ${anonPolicies} anon policy/policies without publicAccessApproved entry.`,
      });
    }

    if (!rlsForced && !isServiceOnly && !isPublicApproved) {
      findings.push({
        severity: "low",
        code: "rls_not_forced",
        table,
        message: `public.${table} does not FORCE ROW LEVEL SECURITY (table owner bypass risk).`,
      });
    }

    if (!rlsEnabled && anonSelectGrant) {
      findings.push({
        severity: "critical",
        code: "anon_grant_exposed",
        table,
        message: `public.${table} grants SELECT to anon without RLS.`,
      });
    }

    if (rlsEnabled && policyCount === 0 && isServiceOnly) {
      findings.push({
        severity: "info",
        code: "service_role_only_ok",
        table,
        message: `public.${table} is service-role-only (approved exception).`,
      });
    }
  }

  const blocking = findings.filter((f) =>
    ["critical", "high", "medium"].includes(f.severity),
  );

  return { findings, blocking, tableCount: rows.length };
}

export function parseSupabaseCsvTable(output) {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim());
  const rows = [];

  for (const line of lines.slice(1)) {
    const values = line.split(",").map((v) => v.trim());
    /** @type {Record<string, string>} */
    const row = {};
    for (let i = 0; i < headers.length; i += 1) {
      row[headers[i]] = values[i] ?? "";
    }
    rows.push(row);
  }

  return rows;
}
