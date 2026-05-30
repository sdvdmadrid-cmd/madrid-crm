#!/usr/bin/env node
/**
 * Fail if legacy Estimate Builder UI/API surfaces reappear in src/.
 * Usage: node scripts/verify-estimate-builder-retired.mjs
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const srcRoot = path.join(root, "src");

const bannedPathFragments = [
  path.join("app", "estimate-builder"),
  path.join("app", "api", "estimate-builder"),
  path.join("components", "NewEstimateForm.js"),
  path.join("lib", "estimate-builder-records.js"),
];

const bannedContent = [
  /from\s+["']@\/components\/NewEstimateForm["']/,
  /import\s+NewEstimateForm/,
  /<NewEstimateForm\b/,
];

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      walk(full, files);
    } else if (/\.(js|jsx|ts|tsx|mjs)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

let failed = 0;

for (const fragment of bannedPathFragments) {
  const target = path.join(srcRoot, fragment);
  if (fs.existsSync(target)) {
    console.error(`[FAIL] Forbidden path still exists: ${path.relative(root, target)}`);
    failed += 1;
  }
}

for (const file of walk(srcRoot)) {
  const rel = path.relative(root, file);
  const text = fs.readFileSync(file, "utf8");
  for (const pattern of bannedContent) {
    if (pattern.test(text)) {
      console.error(`[FAIL] ${rel} matches ${pattern}`);
      failed += 1;
    }
  }
}

if (failed > 0) {
  console.error(`\n[verify-estimate-builder-retired] ${failed} issue(s)`);
  process.exit(1);
}

console.log("[verify-estimate-builder-retired] OK — no legacy Estimate Builder UI in src/");
process.exit(0);
