#!/usr/bin/env node
/**
 * Read-only logical backup of Supabase public schema (production).
 * Does NOT modify production data — SELECT + file write only.
 *
 * Usage:
 *   node scripts/backup/pre-stage1-logical-backup.mjs
 *   node scripts/backup/pre-stage1-logical-backup.mjs --verify-only path/to/backup.sql
 *
 * Requires: SUPABASE_DB_PASSWORD in .env.local
 * Output:   .local-secrets/backups/pre-stage1-public-data-<timestamp>.sql
 */
import { createWriteStream, existsSync, readFileSync, statSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { loadEnvLocal } from "../load-env-local.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "../..");
const PROJECT_REF = "fhcbnupmdpphzdafmmgd";
const REAL_TENANT_MARKERS = [
  "d38fec7b-adac-4b7f-a46d-2ccadab6e452",
  "ebb368d8-248d-4986-8fdd-56a4da7a33d8",
  "6785ddd8-d0a7-4afd-a97e-1ad9f8e377a4",
];

function buildConnectionConfig() {
  const password = process.env.SUPABASE_DB_PASSWORD;
  if (!password) {
    throw new Error("SUPABASE_DB_PASSWORD missing from .env.local");
  }
  return {
    host: `db.${PROJECT_REF}.supabase.co`,
    port: 5432,
    database: "postgres",
    user: "postgres",
    password,
    ssl: { rejectUnauthorized: false },
    statement_timeout: 120_000,
    query_timeout: 120_000,
  };
}

function sqlLiteral(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  if (value instanceof Date) return `'${value.toISOString().replace(/'/g, "''")}'`;
  if (typeof value === "object") {
    return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function listPublicTables(client) {
  const { rows } = await client.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `);
  return rows.map((r) => r.table_name);
}

async function createBackup(outPath) {
  const client = new pg.Client(buildConnectionConfig());
  await client.connect();

  const tables = await listPublicTables(client);
  const meta = {
    generated_at: new Date().toISOString(),
    project_ref: PROJECT_REF,
    schema: "public",
    tables: {},
  };

  const stream = createWriteStream(outPath, { encoding: "utf8" });
  const write = (line) =>
    new Promise((resolveWrite, rejectWrite) => {
      stream.write(`${line}\n`, (err) => (err ? rejectWrite(err) : resolveWrite()));
    });

  await write("-- FieldBase pre-Stage1 logical backup (public schema data)");
  await write(`-- Generated: ${meta.generated_at}`);
  await write(`-- Project: ${PROJECT_REF}`);
  await write("BEGIN;");
  await write("SET session_replication_role = replica;");

  for (const table of tables) {
    const quoted = `"${table.replace(/"/g, '""')}"`;
    const { rows: countRows } = await client.query(
      `SELECT count(*)::bigint AS cnt FROM public.${quoted}`,
    );
    const total = Number(countRows[0]?.cnt || 0);
    meta.tables[table] = total;

    if (total === 0) continue;

    await write(`-- table: ${table} (${total} rows)`);

    const batchSize = 500;
    let offset = 0;
    while (offset < total) {
      const { rows } = await client.query(
        `SELECT * FROM public.${quoted} ORDER BY 1 LIMIT $1 OFFSET $2`,
        [batchSize, offset],
      );
      if (!rows.length) break;

      const columns = Object.keys(rows[0]);
      const colList = columns.map((c) => `"${c.replace(/"/g, '""')}"`).join(", ");

      for (const row of rows) {
        const values = columns.map((c) => sqlLiteral(row[c])).join(", ");
        await write(
          `INSERT INTO public.${quoted} (${colList}) VALUES (${values});`,
        );
      }
      offset += rows.length;
    }
  }

  await write("SET session_replication_role = DEFAULT;");
  await write("COMMIT;");
  await write("-- END BACKUP");

  await new Promise((resolveEnd, rejectEnd) => {
    stream.end((err) => (err ? rejectEnd(err) : resolveEnd()));
  });

  await client.end();
  return meta;
}

function verifyBackupFile(filePath) {
  if (!existsSync(filePath)) {
    throw new Error(`Backup file not found: ${filePath}`);
  }
  const stat = statSync(filePath);
  const content = readFileSync(filePath, "utf8");
  const insertCount = (content.match(/^INSERT INTO /gm) || []).length;
  const hasBegin = content.includes("BEGIN;");
  const hasCommit = content.includes("COMMIT;");
  const realMarkers = REAL_TENANT_MARKERS.filter((id) => content.includes(id));

  return {
    path: filePath,
    bytes: stat.size,
    size_mb: Number((stat.size / (1024 * 1024)).toFixed(2)),
    modified: stat.mtime.toISOString(),
    insert_statements: insertCount,
    has_transaction_wrapper: hasBegin && hasCommit,
    real_tenant_markers_found: realMarkers,
    madrid_present: content.includes("d38fec7b-adac-4b7f-a46d-2ccadab6e452"),
    jms_present: content.includes("ebb368d8-248d-4986-8fdd-56a4da7a33d8"),
  };
}

async function main() {
  const verifyOnly = process.argv.includes("--verify-only");
  const verifyPath = process.argv[process.argv.indexOf("--verify-only") + 1];

  if (verifyOnly) {
    if (!verifyPath) throw new Error("Usage: --verify-only <path>");
    const report = verifyBackupFile(resolve(verifyPath));
    console.log(JSON.stringify({ ok: true, verify: report }, null, 2));
    return;
  }

  const loaded = loadEnvLocal(root);
  if (!loaded.ok) throw new Error(loaded.error);

  const outDir = resolve(root, ".local-secrets/backups");
  await mkdir(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outPath = resolve(outDir, `pre-stage1-public-data-${stamp}.sql`);

  console.log("[backup] Connecting read-only to production Postgres…");
  const meta = await createBackup(outPath);
  const verify = verifyBackupFile(outPath);

  console.log(
    JSON.stringify(
      {
        ok: true,
        backup_path: outPath,
        table_row_counts: meta.tables,
        verify,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error("[backup] FAILED:", err.message);
  process.exit(1);
});
