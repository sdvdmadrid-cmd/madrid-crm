# Module audit: Dashboard

**Status:** Complete — **signed off** ([DASHBOARD_MODULE_SIGN_OFF.md](./DASHBOARD_MODULE_SIGN_OFF.md))  
**Last updated:** 2026-05-28

---

## Workflows tested

| Workflow | Result |
|----------|--------|
| Contractor dashboard load | ✅ E2E |
| Clickable job + inbox metrics | ✅ UX + E2E |
| Product pillars (run/paid/grow) | ✅ Visible |
| Getting started checklist | ✅ Visible |
| `GET /api/dashboard-metrics` | ✅ E2E (+ `leadInbox`) |
| Super-admin redirect | ✅ Owner E2E |

---

## Findings

### Fix now (shipped)

| Issue | Fix |
|-------|-----|
| Metrics not actionable | Links: active jobs → `/jobs`, inbox → `/lead-inbox` |
| Website leads invisible on dashboard | `leadInbox.newCount` in metrics API; combined inbox metric |
| Lead CTA when attention needed | Quick action **Lead inbox (N)** |
| Collections rows static | Unpaid/overdue rows link to `/invoices` |

### Fix before production-ready

| Issue | Ledger | Notes |
|-------|--------|-------|
| Dedicated contracts/reputation widgets | B-004 | Pillar links cover v1 |
| Live activity feed vs placeholders | — | Revenue API when Connect on |
| Average rating / reviews summary | B-004 | Reputation tie-in |

### Future enhancement

| Issue | Justification |
|-------|---------------|
| Customizable widget layout | Enterprise |
| Export KPI PDF | Reporting |

---

## E2E

`tests/e2e/audit/dashboard-module.spec.js`
