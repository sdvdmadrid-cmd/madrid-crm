#!/usr/bin/env node
/**
 * Static verification: every application insert into `estimates` or `payments`
 * must go through requireTenantIdForInsert / resolveInsertTenant / rowHasTenantId.
 *
 * Read-only — exits 1 when unguarded paths are found.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");
const SRC = path.join(ROOT, "src");

const INSERT_GUARD =
  /requireTenantIdForInsert|resolveInsertTenant|paymentTenantIdFromInvoice|tenant_id:\s*insertTenantId/;

function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (entry.name.endsWith(".js") || entry.name.endsWith(".jsx")) acc.push(full);
  }
  return acc;
}

function findInsertBlocks(content, table) {
  const hits = [];
  const pattern = new RegExp(
    `\\.from\\([\\"'](?:${table}|${table.toUpperCase()})[\\"']\\)[\\s\\S]{0,400}?\\.insert\\(`,
    "g",
  );
  let match;
  while ((match = pattern.exec(content)) !== null) {
    hits.push({ index: match.index, snippet: match[0] });
  }
  return hits;
}

const files = walk(SRC);
const violations = [];

for (const file of files) {
  const rel = path.relative(ROOT, file);
  if (rel.includes(`${path.sep}scripts${path.sep}`)) continue;

  const content = fs.readFileSync(file, "utf8");
  for (const table of ["estimates", "payments"]) {
    for (const hit of findInsertBlocks(content, table)) {
      const windowStart = Math.max(0, hit.index - 1200);
      const window = content.slice(windowStart, hit.index + hit.snippet.length + 800);
      if (!INSERT_GUARD.test(window)) {
        violations.push({ file: rel, table, snippet: hit.snippet.slice(0, 120) });
      }
    }
  }
}

if (violations.length) {
  console.error("Unguarded estimate/payment insert paths:");
  for (const v of violations) {
    console.error(`  - ${v.file} (${v.table}): ${v.snippet.replace(/\s+/g, " ")}`);
  }
  process.exit(1);
}

console.log("OK: all src estimates/payments insert paths use tenant guards.");
