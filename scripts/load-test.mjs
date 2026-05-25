#!/usr/bin/env node
/**
 * Synthetic load test for production using autocannon.
 *
 * SAFETY:
 *   - Only hits READ endpoints (GET). No mutation paths.
 *   - Targets routes that have aggressive rate limits already (the
 *     public website + lead-form-config endpoints) so we exercise the
 *     limiter alongside Vercel + Supabase. Hitting our own rate limits
 *     is a feature here.
 *   - Default duration is short (30s) and concurrency moderate (50).
 *     Override with CLI flags --duration / --connections / --rate.
 *   - Refuses to run unless --confirm is passed.
 *
 * Usage:
 *   node scripts/load-test.mjs \
 *     --base https://fieldbase.app \
 *     --slug mysite \
 *     --duration 30 \
 *     --connections 50 \
 *     --confirm
 *
 * The script prints the autocannon summary plus latency percentiles and
 * a back-of-envelope projection of how many concurrent contractors the
 * measured RPS would support.
 */
import autocannon from "autocannon";

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 1) {
    const part = argv[i];
    if (!part.startsWith("--")) continue;
    const key = part.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      out[key] = true;
    } else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

function fmtNumber(n) {
  if (n == null || Number.isNaN(n)) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return Number(n).toLocaleString();
}

function projectionFromRps(rps) {
  // Each actively-working contractor generates ~0.05 RPS while clicking
  // around the dashboard. Use that to translate measured RPS into a
  // contractor concurrency estimate. Cap at Vercel Pro's documented
  // 1000 concurrent invocations.
  const perUserRps = 0.05;
  const concurrentUsers = Math.floor(rps / perUserRps);
  return {
    concurrentUsers,
    cappedByVercel: concurrentUsers >= 20_000,
  };
}

async function runRequest({ baseUrl, path, duration, connections, rate }) {
  const url = new URL(path, baseUrl).toString();
  console.log(`\n========== ${path} ==========`);
  console.log(`URL: ${url}`);
  console.log(
    `Connections: ${connections} · Duration: ${duration}s${rate ? ` · Rate: ${rate} req/s` : ""}`,
  );
  const result = await autocannon({
    url,
    connections: Number(connections),
    duration: Number(duration),
    overallRate: rate ? Number(rate) : undefined,
    pipelining: 1,
    headers: {
      "user-agent": "fieldbase-loadtest/1.0",
      accept: "text/html,application/json",
    },
  });
  const latency = result.latency || {};
  const requests = result.requests || {};
  const throughput = result.throughput || {};
  const rps = Number(requests.average || 0);
  const projection = projectionFromRps(rps);

  console.log(
    `Requests/s   avg=${fmtNumber(rps)}   min=${fmtNumber(requests.min)}   max=${fmtNumber(requests.max)}`,
  );
  console.log(
    `Latency      avg=${(latency.average || 0).toFixed(1)} ms   p95=${(latency.p97_5 || latency.p99 || 0).toFixed(1)} ms   max=${(latency.max || 0).toFixed(1)} ms`,
  );
  console.log(
    `Throughput   avg=${((throughput.average || 0) / 1024).toFixed(1)} KB/s`,
  );
  console.log(
    `Status codes 2xx=${result["2xx"] || 0}  4xx=${result["4xx"] || 0}  5xx=${result["5xx"] || 0}  errors=${result.errors || 0}  timeouts=${result.timeouts || 0}`,
  );
  console.log(
    `Capacity proj. ${fmtNumber(projection.concurrentUsers)} active contractors at this RPS (assumes 0.05 RPS/user)`,
  );
  return { path, result, rps, projection };
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.confirm) {
    console.error(
      "Refusing to run without --confirm. Add it after you understand: this hits PRODUCTION GET endpoints.",
    );
    process.exit(2);
  }

  const baseUrl =
    args.base || process.env.LOAD_TEST_BASE_URL || "https://fieldbaseapp.net";
  const slug = args.slug || process.env.LOAD_TEST_SLUG || "mysite";
  const duration = args.duration || 30;
  const connections = args.connections || 50;
  const rate = args.rate || null;

  const paths = [
    "/api/health",
    `/sites/${slug}`,
    `/api/site/${slug}/lead-form-config`,
  ];

  console.log("Synthetic load test starting");
  console.log("base:", baseUrl);
  console.log("slug:", slug);
  console.log("paths:", paths.join(", "));

  const runs = [];
  for (const path of paths) {
    const result = await runRequest({
      baseUrl,
      path,
      duration,
      connections,
      rate,
    });
    runs.push(result);
  }

  console.log("\n========== SUMMARY ==========");
  const totalRps = runs.reduce((s, r) => s + r.rps, 0);
  const bestProjection = Math.max(...runs.map((r) => r.projection.concurrentUsers));
  console.log(`Aggregate RPS across all endpoints: ${fmtNumber(totalRps)}`);
  console.log(
    `Implied concurrent-contractor headroom from best endpoint: ${fmtNumber(bestProjection)}`,
  );
  console.log(
    "(Reminder: production rate limits will gate any single IP after a few hundred reqs/min, so a low number here is expected.)",
  );
}

main().catch((err) => {
  console.error("Load test failed:", err);
  process.exit(1);
});
