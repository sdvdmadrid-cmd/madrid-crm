# Task 6 — Public Website Link Errors (Complete)

Date: 2026-06-04

## Root cause

| Issue | Impact |
| --- | --- |
| Sidebar labeled **Website** after publish still linked to `/website` (authenticated builder) | Contractors shared or opened the builder URL; homeowners hit login / **401** instead of the public site |
| `publish-status` returned `slug` but the shell ignored it | Nav could not point at `/sites/{slug}` without an extra round trip |
| Workspace company card always linked to `/website` | Same confusion from the sidebar identity block |
| Unpublished sites correctly return **404** on `/sites/{slug}` | Expected; not a bug |

Public routing (`/sites/{slug}`, `/api/site/*`, middleware `PUBLIC_PATHS`, legacy `/site/*` → `/sites/*` redirects) was already correct. The main defect was **wrong outbound links in the authenticated UI**, not missing public routes.

## Fixes

1. **`src/hooks/usePublishedWebsiteStatus.js`** — shared hook reading `/api/website-builder/publish-status` (`published` + `slug`).
2. **`src/components/AuthShell.js`** — when published, secondary nav **Website** opens `/sites/{slug}` in a new tab (`data-testid="sidebar-live-website"`); draft still goes to `/website`.
3. **`src/components/workspace/WorkspaceCompanyCard.jsx`** — published tenants get a live-site link (`workspace-live-website-link`); otherwise builder.

No middleware or Supabase policy changes were required.

## Verification

| Suite | Result |
| --- | --- |
| `tests/e2e/audit/public-website-module.spec.js` | **2/2** |
| `tests/e2e/website-builder-saas.spec.js` | **5/5** |
| `tests/e2e/audit/website-builder-module.spec.js` | **5/5** |

Incognito checks: `GET /sites/{slug}` → 200, `GET /api/site/{slug}/lead-form-config` → 200 (not 401), legacy `/site/{slug}` → 301/302/308 to `/sites/{slug}`.

## Notes for production

- Set `published: true` before sharing; drafts intentionally 404.
- If `NEXT_PUBLIC_SITE_DOMAIN` is enabled, `publicUrl` may use subdomains; ensure DNS points at the app or share the `/sites/{slug}` path from the builder **View site** button.

**Task 6 complete.** Next: final cross-module validation (plan step after Task 6).
