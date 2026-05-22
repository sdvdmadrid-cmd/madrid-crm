#!/usr/bin/env node
/**
 * One-shot production setup: storage bucket + optional env hints.
 */
import fs from "node:fs";
import path from "node:path";

function loadEnvFile(filePath) {
  const out = {};
  if (!fs.existsSync(filePath)) return out;
  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const env = {
  ...loadEnvFile(path.join(process.cwd(), ".env.local")),
  ...loadEnvFile(path.join(process.cwd(), ".env.production")),
};

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || "";
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || "";
const bucket = env.SUPABASE_WEBSITE_MEDIA_BUCKET || "website-media";

if (!supabaseUrl || !serviceKey) {
  console.error("[setup] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

async function listBuckets() {
  const res = await fetch(`${supabaseUrl}/storage/v1/bucket`, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
  });
  if (!res.ok) {
    throw new Error(`list buckets failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function createBucket() {
  const res = await fetch(`${supabaseUrl}/storage/v1/bucket`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      id: bucket,
      name: bucket,
      public: true,
      file_size_limit: 4 * 1024 * 1024,
      allowed_mime_types: ["image/png", "image/jpeg", "image/webp", "image/gif"],
    }),
  });
  const text = await res.text();
  if (res.ok) return { created: true, text };
  if (text.includes("already exists") || res.status === 409) {
    return { created: false, exists: true, text };
  }
  throw new Error(`create bucket failed: ${res.status} ${text}`);
}

async function main() {
  const buckets = await listBuckets();
  const exists = Array.isArray(buckets) && buckets.some((b) => b.id === bucket || b.name === bucket);
  if (exists) {
    console.log(`[setup] Bucket "${bucket}" already exists.`);
  } else {
    const result = await createBucket();
    console.log(
      result.exists
        ? `[setup] Bucket "${bucket}" already exists.`
        : `[setup] Created public bucket "${bucket}".`,
    );
  }
  console.log("[setup] Supabase migrations: run `npm run db:migrate` (requires SUPABASE_DB_PASSWORD).");
  console.log("[setup] Turnstile: set NEXT_PUBLIC_TURNSTILE_SITE_KEY + TURNSTILE_SECRET_KEY in Vercel.");
}

main().catch((err) => {
  console.error("[setup]", err.message || err);
  process.exit(1);
});
