#!/usr/bin/env node
/**
 * Ensures Website Builder prerequisites: OPENAI_API_KEY present, website-media bucket exists.
 */
import { readFileSync, existsSync, appendFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const envPath = resolve(root, ".env.local");

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

async function main() {
  if (!existsSync(envPath)) {
    console.log("[website-builder-ai] No .env.local — run npm run env:ensure first.");
    process.exit(0);
  }

  const env = parseEnv(readFileSync(envPath, "utf8"));
  const additions = [];

  if (!env.get("OPENAI_API_KEY")) {
    console.warn(
      "[website-builder-ai] OPENAI_API_KEY missing — add your key to .env.local for AI copy & images.",
    );
    additions.push("# OPENAI_API_KEY=sk-...  # Required for Website Builder AI");
  } else {
    console.log("[website-builder-ai] OPENAI_API_KEY present.");
  }

  if (!env.get("SUPABASE_WEBSITE_MEDIA_BUCKET")) {
    additions.push("SUPABASE_WEBSITE_MEDIA_BUCKET=website-media");
  }

  if (additions.length) {
    appendFileSync(
      envPath,
      `\n# website-builder-ai ${new Date().toISOString()}\n${additions.join("\n")}\n`,
      "utf8",
    );
  }

  const url = env.get("NEXT_PUBLIC_SUPABASE_URL");
  const key = env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (url && key) {
    const { spawn } = await import("node:child_process");
    await new Promise((resolvePromise, reject) => {
      const child = spawn(process.execPath, ["scripts/setup-website-production.mjs"], {
        cwd: root,
        stdio: "inherit",
        env: process.env,
      });
      child.on("exit", (code) => (code === 0 ? resolvePromise() : reject(new Error(`setup exit ${code}`))));
    });
    console.log("[website-builder-ai] Storage bucket check complete.");
  } else {
    console.warn("[website-builder-ai] Supabase keys missing — bucket not verified.");
  }
}

main().catch((err) => {
  console.error("[website-builder-ai]", err.message || err);
  process.exit(1);
});
