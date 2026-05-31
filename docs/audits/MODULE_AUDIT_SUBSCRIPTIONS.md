# Module audit: Subscriptions (FieldBase SaaS billing)

**Status:** Complete — **signed off** ([SUBSCRIPTIONS_MODULE_SIGN_OFF.md](./SUBSCRIPTIONS_MODULE_SIGN_OFF.md))  
**Last updated:** 2026-05-28

---

## Workflows tested

| Workflow | Result |
|----------|--------|
| Page load | ✅ E2E |
| Back to settings | ✅ UX |
| GET current + invoices APIs | ✅ E2E |
| Create / portal / cancel | Partial | Stripe env dependent |

---

## Findings

### Fix now (shipped)

| Issue | Fix |
|-------|-----|
| Raw `fetch` without session helpers | `apiFetch` + `getJsonOrThrow` |
| Back link went to dashboard | **All settings** → `/settings` |
| Mixed Spanish UI for US contractors | English shell, dates, status badges, plan copy |
| E2E gaps | `subscriptions-page` test ids |

### Fix before production-ready

| Issue | Ledger | Notes |
|-------|--------|-------|
| Remaining Spanish body copy in cards | B-005 | i18n pass |
| Inline complimentary tenant copy | — | Dev/owner only |

### Future enhancement

| Issue | Justification |
|-------|---------------|
| Plan tier picker | Single plan today |
| Usage-based billing display | Not applicable yet |

---

## E2E

`tests/e2e/audit/subscriptions-module.spec.js`
