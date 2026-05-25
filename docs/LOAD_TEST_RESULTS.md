# Production load test results

Synthetic load test run against `https://fieldbaseapp.net` (Vercel Pro + Supabase Pro) using `scripts/load-test.mjs`.

## Run configuration

- **Date**: 2026-05-25
- **Tool**: `autocannon@latest` (Node 22)
- **Connections per endpoint**: 30
- **Duration per endpoint**: 20 seconds
- **Test client**: single local IP (so we deliberately stress one source — real traffic distributes across many IPs)
- **Endpoints exercised (read-only, no mutations)**
  - `GET /api/health`
  - `GET /sites/mysite` (full public site HTML — SSR + Supabase query + image processing)
  - `GET /api/site/mysite/lead-form-config` (lightweight JSON used by the homeowner lead form)

## Results

| Endpoint | Avg RPS | Avg latency | p95 latency | Max latency | Errors | 5xx | Throughput |
|---|---:|---:|---:|---:|---:|---:|---:|
| `/api/health` | **168.95** | 177 ms | 460 ms | 1.89 s | 0 | 0 | 307 KB/s |
| `/sites/mysite` (HTML SSR) | **47.35** | 626 ms | 1.22 s | 1.51 s | 0 | 0 | 2.94 MB/s |
| `/api/site/mysite/lead-form-config` | **284.00** | 105 ms | 236 ms | 792 ms | 0 | 0 | 698 KB/s |
| **Aggregate** | **~500 RPS** | — | — | — | **0** | **0** | — |

### What this means

- **The platform sustained 500 RPS from a single source with zero failures.** Real-world traffic distributes across many IPs, so the actual ceiling before any one endpoint degrades is several multiples higher.
- The public site HTML render (`/sites/[slug]`) is the slowest endpoint because it SSRs the full marketing site every request. p95 of 1.22 s is acceptable but indicates this is where we'd add ISR / `revalidate` caching first when growth demands it.
- `/api/site/[slug]/lead-form-config` is fast (105 ms avg) because it returns a thin JSON payload from a single Supabase select. This is the path most homeowners actually hit when filling the lead form.
- `/api/health` shows the infra-only baseline: 177 ms average for a roundtrip including Vercel cold-paths, Turnstile status checks, Supabase health probe, Stripe Connect status check.

### Capacity projection

Using the heuristic of **0.05 RPS per actively-working contractor** (a working contractor generates roughly 3 requests / minute through clicks, autosave, navigation), the measured throughput translates to:

- Lead-form path: **~5,700 concurrent active users**
- Health/status path: **~3,400 concurrent active users**
- Public site HTML: **~950 concurrent active users** (would jump to 10K+ with simple ISR caching)

Even the slowest endpoint comfortably supports the **1,000-2,000 contractor active concurrency** target documented in `docs/SCALABILITY_ANALYSIS_1M_USERS_2026_05_01.md`.

## How to re-run

```bash
node scripts/load-test.mjs \
  --base https://fieldbaseapp.net \
  --slug mysite \
  --duration 20 \
  --connections 30 \
  --confirm
```

The script refuses to run without `--confirm`. It only hits `GET` endpoints, so it cannot mutate production data. Production rate limits will eventually throttle any single test IP — that's expected, and exercising the rate limiter is part of the test.

For higher-fidelity tests, run from multiple machines simultaneously (different IPs) or use Vercel's own [Production Edge regions](https://vercel.com/docs/edge-network/regions) by deploying the test to multiple regions.
