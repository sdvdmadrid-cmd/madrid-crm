import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const text = fs.readFileSync(filePath, "utf8");
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function loadOpenAiKey() {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  const local = parseEnvFile(path.join(ROOT, ".env.local"));
  if (local.OPENAI_API_KEY) return local.OPENAI_API_KEY;
  const prod = parseEnvFile(path.join(ROOT, ".env.production"));
  if (prod.OPENAI_API_KEY) return prod.OPENAI_API_KEY;
  return "";
}

async function chat(apiKey, model, prompt, maxTokens = 120) {
  const startedAt = Date.now();
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: maxTokens,
      temperature: 0.2,
    }),
  });

  const json = await response.json().catch(() => ({}));
  return {
    ok: response.ok,
    status: response.status,
    responseTimeMs: Date.now() - startedAt,
    code: json?.error?.code || "",
    message: json?.error?.message || "",
    usage: json?.usage || {},
    content: String(json?.choices?.[0]?.message?.content || "").trim(),
  };
}

function printResult(label, result) {
  if (!result.ok) {
    console.log(`${label}: FAIL (${result.status}) ${result.code || ""} ${result.message || ""}`.trim());
    return false;
  }
  const total = Number(result.usage?.total_tokens || 0);
  console.log(`${label}: OK (${result.responseTimeMs}ms, ${total} tokens)`);
  return true;
}

async function main() {
  const apiKey = loadOpenAiKey();
  if (!apiKey) {
    console.error("OPENAI_API_KEY not found in env, .env.local, or .env.production");
    process.exit(1);
  }

  const modelMini = process.env.OPENAI_MODEL_DEFAULT || "gpt-4.1-mini";
  const modelStrong = process.env.OPENAI_MODEL_STRONG || "gpt-4.1";

  const checks = [
    ["Health", modelMini, "Reply with OK only.", 8],
    ["Estimate descriptions", modelMini, "Rewrite this as a professional estimate description: Paint 2 bedrooms and hallway by Friday.", 120],
    ["Client reply assistant", modelMini, "Draft a concise reply to: Can you move my appointment to next Tuesday at 10am?", 140],
    ["Scheduling assistant", modelMini, "Suggest schedule options for a 4-hour roof inspection with rain expected after 3pm.", 140],
    ["Proposal generator", modelStrong, "Create a concise contractor proposal for installing 1200 sq ft pavers with drainage.", 260],
    ["CRM summaries", modelStrong, "Summarize this CRM snapshot and give top 3 actions: 42 clients, 18 open jobs, 9 overdue invoices.", 220],
  ];

  let pass = 0;
  for (const [label, model, prompt, maxTokens] of checks) {
    const result = await chat(apiKey, model, prompt, maxTokens);
    if (printResult(label, result)) pass += 1;
  }

  console.log(`Result: ${pass}/${checks.length} checks passed`);
  if (pass !== checks.length) process.exit(2);
}

main().catch((error) => {
  console.error("verify-openai-integration failed", error?.message || error);
  process.exit(1);
});
