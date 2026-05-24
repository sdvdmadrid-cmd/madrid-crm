import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Parse .env.local into process.env (no secrets logged).
 * Strips UTF-8 BOM if present.
 */
export function loadEnvLocal(root = process.cwd()) {
  const envPath = resolve(root, ".env.local");
  if (!existsSync(envPath)) {
    return { ok: false, error: ".env.local not found", path: envPath };
  }

  let raw = readFileSync(envPath, "utf8");
  if (raw.charCodeAt(0) === 0xfeff) {
    raw = raw.slice(1);
  }

  const applied = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      return { ok: false, error: `Invalid env key on line: ${trimmed.slice(0, 40)}`, path: envPath };
    }
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
    applied.push(key);
  }

  return { ok: true, path: envPath, keys: applied };
}
