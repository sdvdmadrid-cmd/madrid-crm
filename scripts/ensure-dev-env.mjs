import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const envPath = resolve(root, ".env.local");
const examplePath = resolve(root, ".env.example");

const REQUIRED_KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SESSION_SECRET",
  "APP_URL",
  "APP_BASE_URL",
];

function parseEnv(content) {
  const map = new Map();
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    map.set(trimmed.slice(0, idx).trim(), trimmed.slice(idx + 1).trim());
  }
  return map;
}

function generateSessionSecret() {
  return randomBytes(32).toString("hex");
}

function generateEncryptionKey() {
  return randomBytes(32).toString("hex");
}

if (!existsSync(envPath)) {
  if (existsSync(examplePath)) {
    writeFileSync(envPath, readFileSync(examplePath, "utf8"), "utf8");
    console.log("[ensure-dev-env] Created .env.local from .env.example");
  } else {
    writeFileSync(envPath, "", "utf8");
    console.log("[ensure-dev-env] Created empty .env.local");
  }
}

const content = readFileSync(envPath, "utf8");
const env = parseEnv(content);
const additions = [];

if (!env.get("SESSION_SECRET") || env.get("SESSION_SECRET").includes("replace-with")) {
  additions.push(`SESSION_SECRET=${generateSessionSecret()}`);
}

if (!env.get("ENCRYPTION_KEY") || env.get("ENCRYPTION_KEY").length < 64) {
  additions.push(`ENCRYPTION_KEY=${generateEncryptionKey()}`);
}

if (!env.get("APP_BASE_URL")) {
  additions.push("APP_BASE_URL=http://localhost:3000");
}

if (!env.get("APP_URL")) {
  additions.push("APP_URL=http://localhost:3000");
}

if (!env.get("SUPER_ADMIN_EMAIL")) {
  const ownerEmail =
    env.get("DEV_SUPERADMIN_EMAIL") || "owner@fieldbase.local";
  additions.push(`SUPER_ADMIN_EMAIL=${ownerEmail}`);
}

if (!env.get("SUPER_ADMIN_EMAILS")) {
  additions.push(
    "SUPER_ADMIN_EMAILS=admin@fieldbase.local,admin@fieldbase.com,owner@fieldbase.local",
  );
}

if (additions.length > 0) {
  appendFileSync(
    envPath,
    `\n# ensure-dev-env ${new Date().toISOString()}\n${additions.join("\n")}\n`,
    "utf8",
  );
  console.log("[ensure-dev-env] Added:", additions.map((l) => l.split("=")[0]).join(", "));
}

const refreshed = parseEnv(readFileSync(envPath, "utf8"));
const missing = REQUIRED_KEYS.filter((key) => !refreshed.get(key));

if (missing.length > 0) {
  console.error(
    "[ensure-dev-env] Still missing (set in .env.local):",
    missing.join(", "),
  );
  process.exit(1);
}

console.log("[ensure-dev-env] OK — SESSION_SECRET and required keys present.");
