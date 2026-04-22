import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const envPath = path.join(root, ".env.local");
const rawEnv = fs.readFileSync(envPath, "utf8");
for (const line of rawEnv.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const index = trimmed.indexOf("=");
  if (index === -1) continue;
  const key = trimmed.slice(0, index).trim();
  const value = trimmed.slice(index + 1);
  if (!(key in process.env)) process.env[key] = value;
}

const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`;
const response = await fetch(url, {
  headers: {
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    Accept: "application/openapi+json",
  },
});

const text = await response.text();
console.log(JSON.stringify({ status: response.status, contentType: response.headers.get("content-type"), preview: text.slice(0, 2000) }, null, 2));
