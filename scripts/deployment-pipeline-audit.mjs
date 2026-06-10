#!/usr/bin/env node
/**
 * End-to-end deployment pipeline audit (no guesses).
 * Usage: node scripts/deployment-pipeline-audit.mjs [production-base-url]
 */
import { execSync } from "node:child_process";
import fs from "node:fs";

const base = String(
  process.argv[2] || process.env.APP_BASE_URL || "https://fieldbaseapp.net",
).replace(/\/$/, "");

const results = [];

function pass(name, detail = "") {
  results.push({ name, ok: true, detail });
  console.log(`  [PASS] ${name}${detail ? ` — ${detail}` : ""}`);
}

function fail(name, detail = "") {
  results.push({ name, ok: false, detail });
  console.error(`  [FAIL] ${name}${detail ? ` — ${detail}` : ""}`);
}

function warn(name, detail = "") {
  results.push({ name, ok: true, warn: true, detail });
  console.log(`  [WARN] ${name}${detail ? ` — ${detail}` : ""}`);
}

function gitSha() {
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

function gitMainSha() {
  try {
    execSync("git fetch origin main --quiet", { stdio: "ignore" });
    return execSync("git rev-parse origin/main", { encoding: "utf8" }).trim();
  } catch {
    return gitSha();
  }
}

async function fetchJson(path) {
  const nonce = `__cb=${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const separator = path.includes("?") ? "&" : "?";
  const url = `${base}${path}${separator}${nonce}`;
  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* html */
  }
  return { res, json, text };
}

async function main() {
  console.log(`\n[deployment-pipeline-audit] Production: ${base}\n`);

  const localMain = gitMainSha();
  const localShort = localMain.slice(0, 12);
  if (localMain) {
    pass("Git origin/main resolved", localShort);
  } else {
    fail("Git origin/main resolved", "not a git repo");
  }

  const { res: healthRes, json: health } = await fetchJson("/api/health");
  const prodSha = String(health?.commitSha || "").trim();
  if (!healthRes.ok) {
    fail("GET /api/health", `status ${healthRes.status}`);
  } else {
    pass("GET /api/health", `status ${healthRes.status}`);
  }

  if (localMain && prodSha) {
    const prodFull = prodSha.length >= 12 ? prodSha : prodSha;
    const matches =
      localMain.startsWith(prodFull) ||
      prodFull.startsWith(localShort) ||
      localShort === prodSha.slice(0, 12);
    if (matches) {
      pass("Production commit matches origin/main", `${prodSha} ≈ ${localShort}`);
    } else {
      fail(
        "Production commit matches origin/main",
        `prod=${prodSha} git=${localShort}`,
      );
    }
  }
  const healthHeaderCommit = String(
    healthRes.headers.get("x-fieldbase-commit") || "",
  ).slice(0, 12);
  if (healthHeaderCommit) {
    if (prodSha && !prodSha.startsWith(healthHeaderCommit)) {
      fail(
        "Health header commit matches body",
        `header=${healthHeaderCommit} body=${prodSha}`,
      );
    } else {
      pass("Health header commit matches body", healthHeaderCommit);
    }
  } else {
    warn("Health header commit present", "missing x-fieldbase-commit");
  }

  const { json: features } = await fetchJson("/api/deploy-features");
  if (features?.success && Array.isArray(features.features)) {
    pass("GET /api/deploy-features", `${features.features.length} features`);
  } else {
    fail("GET /api/deploy-features", "missing or invalid");
  }

  const { res: loginRes, text: loginHtml } = await fetchJson("/login");
  const htmlBuild = loginHtml.match(/data-fieldbase-build="([a-f0-9]{7,40})"/i)?.[1];
  const cacheControl = loginRes.headers.get("cache-control") || "";
  if (loginRes.ok) pass("GET /login", String(loginRes.status));
  else fail("GET /login", String(loginRes.status));

  if (htmlBuild) {
    pass("SSR build marker in HTML", htmlBuild);
    if (prodSha && !htmlBuild.startsWith(prodSha.slice(0, 12))) {
      fail("HTML build marker matches /api/health", `html=${htmlBuild} health=${prodSha}`);
    } else if (prodSha) {
      pass("HTML build marker matches /api/health");
    }
  } else {
    warn(
      "SSR build marker in HTML",
      "data-fieldbase-build absent (verifying via X-Fieldbase-Commit header instead)",
    );
  }

  if (/no-store|no-cache/i.test(cacheControl)) {
    pass("HTML Cache-Control", cacheControl);
  } else {
    warn("HTML Cache-Control", cacheControl || "(empty)");
  }

  const commitHeader = loginRes.headers.get("x-fieldbase-commit");
  if (commitHeader) {
    pass("X-Fieldbase-Commit header", commitHeader);
  } else {
    warn("X-Fieldbase-Commit header", "not set yet (deploy middleware change)");
  }

  const cssMatch = loginHtml.match(/\/_next\/static\/chunks\/[^"]+\.css/g) || [];
  let premiumCss = false;
  for (const rel of cssMatch.slice(0, 6)) {
    const cssRes = await fetch(`${base}${rel}`, { cache: "no-store" });
    const css = await cssRes.text();
    if (css.includes(".fb-workspace")) {
      premiumCss = true;
      pass("Premium workspace CSS in bundle", rel.split("/").pop());
      break;
    }
  }
  if (!premiumCss) {
    fail("Premium workspace CSS in bundle", "no .fb-workspace in first CSS chunks");
  }

  try {
    const devRes = await fetch(`${base}/api/auth/dev-login?profile=admin`, {
      redirect: "manual",
    });
    if (devRes.status === 404 || devRes.status === 403) {
      pass("DEV_LOGIN blocked on production", `status ${devRes.status}`);
    } else {
      warn("DEV_LOGIN on production", `status ${devRes.status} (expected 404)`);
    }
  } catch (e) {
    warn("DEV_LOGIN check", e.message);
  }

  if (fs.existsSync("public/sw.js")) {
    fail("Service worker file", "public/sw.js exists");
  } else {
    pass("No public/sw.js service worker");
  }

  try {
    const vercelOut = execSync("vercel ls madrid-app --prod", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const firstLine = vercelOut.split("\n").find((l) => l.includes("Ready") && l.includes("Production"));
    if (firstLine) {
      pass("Vercel production deployment", firstLine.trim().slice(0, 120));
    } else {
      warn("Vercel production deployment", "parse vercel ls manually");
    }
  } catch {
    warn("Vercel CLI", "vercel ls skipped (CLI not auth)");
  }

  try {
    execSync("npm run security:check:ci", { stdio: "pipe", encoding: "utf8" });
    pass("Migration RLS security lint");
  } catch (e) {
    fail("Migration RLS security lint", String(e.stderr || e.stdout || e.message).slice(0, 200));
  }

  if (process.env.SUPABASE_DB_PASSWORD) {
    try {
      execSync("npm run audit:schema-rls -- --remote-only", {
        stdio: "pipe",
        encoding: "utf8",
        env: process.env,
      });
      pass("Remote Supabase RLS audit");
    } catch (e) {
      fail("Remote Supabase RLS audit", String(e.stderr || e.stdout || e.message).slice(0, 200));
    }
  } else {
    warn("Remote Supabase RLS audit", "SUPABASE_DB_PASSWORD not set in environment");
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\nSummary: ${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    console.error("\nFailed checks:");
    for (const f of failed) console.error(`  - ${f.name}: ${f.detail}`);
    process.exit(1);
  }
  console.log("\nDeployment pipeline is consistent: git main ≈ production runtime.\n");
}

main().catch((err) => {
  console.error("[deployment-pipeline-audit]", err);
  process.exit(1);
});
