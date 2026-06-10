/**
 * Static analysis helpers for Supabase migration RLS coverage.
 * Used by validate-migration-rls.mjs and unit tests.
 */

const CREATE_TABLE_RE =
  /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:(?:only\s+)?public\.)?("?[a-z_][a-z0-9_]*"?)/gi;

const ENABLE_RLS_RE =
  /alter\s+table\s+(?:if\s+exists\s+)?(?:(?:only\s+)?public\.)?("?[a-z_][a-z0-9_]*"?)\s+enable\s+row\s+level\s+security/gi;

const DROP_TABLE_RE =
  /drop\s+table\s+(?:if\s+exists\s+)?(?:(?:only\s+)?public\.)?("?[a-z_][a-z0-9_]*"?)/gi;

const SQL_ARRAY_LITERAL_RE = /array\s*\[([\s\S]*?)\]/gi;
const QUOTED_IDENTIFIER_RE = /'([a-z_][a-z0-9_]*)'/gi;

function normalizeIdent(raw) {
  return String(raw || "").replaceAll('"', "").trim().toLowerCase();
}

function extractQuotedTableNames(block) {
  const names = new Set();
  for (const match of block.matchAll(QUOTED_IDENTIFIER_RE)) {
    names.add(match[1].toLowerCase());
  }
  return names;
}

/**
 * When migrations enable RLS in a DO loop over a text[] array, capture table names.
 */
export function extractRlsTargetsFromArrayBlocks(content) {
  const lower = content.toLowerCase();
  if (!lower.includes("enable row level security")) {
    return new Set();
  }

  const targets = new Set();
  for (const match of content.matchAll(SQL_ARRAY_LITERAL_RE)) {
    for (const name of extractQuotedTableNames(match[1])) {
      targets.add(name);
    }
  }
  return targets;
}

export function parseMigrationSql(content) {
  const created = new Set();
  const rlsEnabled = new Set();
  const dropped = new Set();

  for (const match of content.matchAll(CREATE_TABLE_RE)) {
    created.add(normalizeIdent(match[1]));
  }

  for (const match of content.matchAll(ENABLE_RLS_RE)) {
    rlsEnabled.add(normalizeIdent(match[1]));
  }

  for (const match of content.matchAll(DROP_TABLE_RE)) {
    dropped.add(normalizeIdent(match[1]));
  }

  for (const name of extractRlsTargetsFromArrayBlocks(content)) {
    rlsEnabled.add(name);
  }

  return {
    created: [...created],
    rlsEnabled: [...rlsEnabled],
    dropped: [...dropped],
  };
}

/**
 * Walk migrations in timestamp order; every public table must eventually get RLS enabled.
 */
export function auditMigrationHistory(files) {
  /** @type {Map<string, { createdIn: string, rlsIn: string | null }>} */
  const tables = new Map();
  const issues = [];

  const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name));

  for (const file of sorted) {
    const parsed = parseMigrationSql(file.content);
    const rlsSet = new Set(parsed.rlsEnabled);

    for (const table of parsed.dropped) {
      tables.delete(table);
    }

    for (const table of parsed.created) {
      if (!tables.has(table)) {
        tables.set(table, { createdIn: file.name, rlsIn: null });
      }
    }

    for (const table of parsed.rlsEnabled) {
      const entry = tables.get(table);
      if (entry && !entry.rlsIn) {
        entry.rlsIn = file.name;
      } else if (!entry && !parsed.created.includes(table)) {
        // RLS on pre-existing table — OK
      }
    }

    for (const [table, meta] of tables) {
      if (!meta.rlsIn && rlsSet.has(table)) {
        meta.rlsIn = file.name;
      }
    }
  }

  for (const [table, meta] of tables) {
    if (!meta.rlsIn) {
      issues.push({
        type: "missing_rls",
        table,
        createdIn: meta.createdIn,
        message: `Table public.${table} is created in ${meta.createdIn} but never has RLS enabled in any migration.`,
      });
    }
  }

  return { issues, tableCount: tables.size };
}

/**
 * Stricter rule for newly added/changed migration files in PRs.
 */
export function auditMigrationFileSameFileRule(name, content) {
  const parsed = parseMigrationSql(content);
  const rlsSet = new Set(parsed.rlsEnabled);
  const issues = [];

  for (const table of parsed.created) {
    if (!rlsSet.has(table)) {
      issues.push({
        type: "same_file_rls",
        table,
        file: name,
        message:
          `Table public.${table} is created in ${name} without enabling RLS in the same file. ` +
          "Add `alter table public." +
          table +
          " enable row level security` (and policies) in this migration.",
      });
    }
  }

  return issues;
}
