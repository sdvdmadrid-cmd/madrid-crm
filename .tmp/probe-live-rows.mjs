import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

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

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const tables = ["clients", "jobs", "invoices"];
const report = {};
for (const table of tables) {
  const { data, error } = await supabase.from(table).select("*").limit(2);
  report[table] = {
    error: error?.message || null,
    rowCount: Array.isArray(data) ? data.length : 0,
    columns: Array.isArray(data) && data[0] ? Object.keys(data[0]).sort() : [],
    sample: Array.isArray(data) ? data : [],
  };
}
console.log(JSON.stringify(report, null, 2));
