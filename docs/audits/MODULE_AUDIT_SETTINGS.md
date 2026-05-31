# Module audit: Settings (contractor hub)

**Status:** Complete — **signed off** ([SETTINGS_MODULE_SIGN_OFF.md](./SETTINGS_MODULE_SIGN_OFF.md))  
**Last updated:** 2026-05-28

---

## Scope

- `/settings` — hub
- `/settings/payments` — Stripe Connect (existing component)
- Cross-links to `/subscriptions`, `/services-catalog`, `/website`

**Note:** Company profile editing lives in **Website builder** setup and **Owner settings** (`/owner/settings`) for platform operators.

---

## Workflows tested

| Workflow | Result |
|----------|--------|
| Hub cards visible | ✅ E2E |
| Payments settings load + back link | ✅ E2E |
| Trust strip | ✅ Visible |

---

## Findings

### Fix now (shipped)

| Issue | Fix |
|-------|-----|
| Hub only showed payments + subscription | Added **Service catalog** + **Website & branding** cards |
| E2E gaps | `settings-hub` + per-card test ids |

### Fix before production-ready

| Issue | Ledger | Notes |
|-------|--------|-------|
| Dedicated company profile page on hub | B-002 | Website builder covers branding today |
| Notification preferences | — | Not implemented |
| Team/users RBAC UI | B-002 | Admin pass |

### Future enhancement

| Issue | Justification |
|-------|---------------|
| Single-page settings tabs | UX polish |
| Document language default | Partially on company profile API |

---

## E2E

`tests/e2e/audit/settings-module.spec.js`
