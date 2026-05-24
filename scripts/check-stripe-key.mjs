import fs from "node:fs";

function parseEnv(path) {
  const out = {};
  if (!fs.existsSync(path)) return out;
  for (const line of fs.readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[trimmed.slice(0, eq).trim()] = value;
  }
  return out;
}

function mask(key) {
  const k = String(key || "");
  if (!k) return "missing";
  return `${k.slice(0, 7)}...${k.slice(-4)} (len=${k.length})`;
}

async function validate(label, secretKey) {
  const key = String(secretKey || "").trim();
  console.log(`\n[${label}] ${mask(key)}`);
  if (!key) {
    console.log("  -> missing");
    return false;
  }
  if (key.includes("\n") || key.includes("\r")) {
    console.log("  -> INVALID: contains newline");
  }
  const res = await fetch("https://api.stripe.com/v1/balance", {
    headers: { Authorization: `Bearer ${key}` },
  });
  const body = await res.text();
  console.log(`  -> HTTP ${res.status}: ${body.slice(0, 180)}`);
  return res.ok;
}

const local = parseEnv(".env.local");
const prod = parseEnv(".env.vercel.check");

await validate("local .env.local", local.STRIPE_SECRET_KEY);
if (Object.keys(prod).length) {
  await validate("vercel production", prod.STRIPE_SECRET_KEY);
}
