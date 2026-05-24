# Deployment Pipeline Audit Report

**Date:** 2026-05-24  
**Auditor:** Automated trace (`scripts/deployment-pipeline-audit.mjs`) + Vercel CLI + DNS  
**Production URL:** https://fieldbaseapp.net  

## Executive conclusion

**The deployment pipeline is working.** Production is not serving an old git commit. The live runtime reports the same SHA as `origin/main` (`80c6758` at time of audit).

If the product “looks like before” while `prod · 80c6758` is visible, the cause is **not** a failed Vercel deploy. See [Root cause: different app surface](#root-cause-different-app-surface), not stale build.

---

## Checklist (evidence)

| # | Check | Result | Evidence |
|---|--------|--------|----------|
| 1 | **Git branch → Vercel** | PASS | Repo `sdvdmadrid-cmd/madrid-crm`, project `fieldbaseapp/madrid-app`, production alias `fieldbaseapp.net` |
| 2 | **Latest commits on production branch** | PASS | `origin/main` = `80c6758` = `GET /api/health` `commitSha` |
| 3 | **Vercel build / deploy** | PASS | Deployment `dpl_HG7GVWfHj2n87bvPPMCUQMPYfEga` Ready, target `production`, aliases include `fieldbaseapp.net` |
| 4 | **Environment variables** | PASS | 30+ production vars set in Vercel (Supabase, Stripe, SESSION_SECRET, APP_URL, etc.) |
| 5 | **Service worker / PWA** | PASS | No `public/sw.js`; client unregisters any SW on load; manifest only (no SW cache layer) |
| 6 | **Stale artifacts** | PASS | Login CSS bundle includes `.fb-workspace` (premium shell shipped in build) |
| 7 | **Middleware / feature flags** | PASS | No flag disables website builder in DB (defaults used); `feature_website_builder` not disabled |

---

## 1. Git ↔ Vercel

- **GitHub default branch:** `main` (latest: `80c6758cb1b2`)
- **Vercel project:** `madrid-app` → https://fieldbaseapp.net
- **Production deploy trigger:** Push/merge to `main` (Vercel Git integration)
- **GitHub Actions:** `Security Preflight` + `Preview Build Guard` on PRs only — **they do not deploy production**. Vercel deploys production.

## 2. Production runtime fingerprint

```bash
curl -s https://fieldbaseapp.net/api/health
# commitSha: 80c6758cb1b2, stripeConnectEnabled: true

curl -s https://fieldbaseapp.net/api/deploy-features
# lists: website_builder, lead_inbox, public /site/slug, etc.
```

HTML (`/login`):

- `data-fieldbase-build="80c6758cb1b2"`
- Footer `prod · 80c6758`
- `Cache-Control: private, no-cache, no-store, must-revalidate`

## 3. Domains (use the right URL)

| URL | `/api/health` | Notes |
|-----|----------------|-------|
| https://fieldbaseapp.net | OK | **Canonical production** |
| https://www.fieldbaseapp.net | OK | Same deploy |
| https://madrid-app-delta.vercel.app | OK | Production alias |
| https://madrid-app-git-main-fieldbaseapp.vercel.app | Blocked | **Vercel Deployment Protection** (SSO) — not the public app |

**Do not** test production on `madrid-app-git-main-*.vercel.app` unless authenticated.

## 4. Environment variables

Pulled via `vercel env ls production`: Supabase, Stripe, `APP_URL`, `SESSION_SECRET`, `STRIPE_CONNECT_ENABLED`, etc. all present.

Required for signed links and auth:

- `APP_URL` / `APP_BASE_URL` → must be `https://fieldbaseapp.net`
- `SESSION_SECRET` → must be set (32+ chars)

## 5. Service worker / PWA

- No service worker registered by the app.
- `AuthShell` unregisters existing SW registrations on mount (cleanup only).
- Installed PWA may still cache old shell — remove from home screen if UI looks wrong.

## 6. Stale artifacts

Next.js emits hashed assets under `/_next/static/chunks/`. Production CSS chunk contains `.fb-workspace` — confirms premium CRM shell is in the **current** bundle, not an old build.

## 7. Middleware & feature flags

- **Middleware:** Bill-pay disabled routes, rate limits, legal cookie, super_admin → owner unless `fb_contractor_workspace=1` cookie.
- **Feature flags:** `platform_feature_flags` table — `feature_website_builder` not set to `false` (defaults to enabled).

---

## Root cause: different app surface

| Localhost | Production (typical owner login) |
|-----------|----------------------------------|
| `dev-login` → **contractor** role | Email login → **super_admin** |
| `/website`, `/lead-inbox`, dark CRM | **Mission Control** `/owner/overview` |
| Same code, different routes | Looks “unchanged” |

**Fix (in app since PR #19):** `/owner/overview` → **“Abrir workspace contractor”** → then open `/website`, `/lead-inbox`, etc.

---

## Stable workflow (going forward)

1. **Merge PR to `main`** (only path to production).
2. Wait ~2 minutes for Vercel production deploy.
3. Run locally: `npm run deploy:audit`
4. CI runs **Production Deploy Verify** on every push to `main` — fails if `commitSha` ≠ `GITHUB_SHA`.
5. Confirm in browser: `prod · xxxxxxxx` matches `curl …/api/health` and response header `X-Fieldbase-Commit`.

### Force clean rebuild (only if audit fails)

```bash
# Vercel dashboard → Redeploy → uncheck "Use existing build cache"
# Or CLI with fresh build:
vercel deploy --prod --force
```

---

## If audit fails

1. Check Vercel → Project → Settings → Git → **Production Branch = main**
2. Check deploy logs for failed build
3. Compare `curl https://fieldbaseapp.net/api/health` with `git rev-parse origin/main`
4. Open issue with output of `npm run deploy:audit`
