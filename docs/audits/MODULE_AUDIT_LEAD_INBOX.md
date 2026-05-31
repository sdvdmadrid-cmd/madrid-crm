# Module audit: Lead Inbox

**Status:** Complete — **signed off** ([LEAD_INBOX_MODULE_SIGN_OFF.md](./LEAD_INBOX_MODULE_SIGN_OFF.md))  
**Last updated:** 2026-05-28  
**Scope:** Website leads + estimate requests queue, convert-to-estimate, status workflow

---

## What this module includes

| Surface | Path / API | Contractor purpose |
|---------|------------|-------------------|
| Lead Inbox UI | `/lead-inbox` | Review inbound leads, update status, convert |
| Inbox API | `GET /api/lead-inbox` | Merged `contractor_website_leads` + `estimate_requests` |
| Status update | `PATCH /api/lead-inbox/leads/:id` | Website lead pipeline status |
| Convert | `POST /api/lead-inbox/convert` | Create/find client + draft estimate |
| AI reply (optional) | `POST /api/ai/client-reply` | Suggested email/SMS copy |
| E2E seed (dev only) | `POST /api/lead-inbox/leads` | Reliable audit data when `E2E_BYPASS_RATE_LIMIT=1` |

---

## Workflows tested

| Workflow | Result |
|----------|--------|
| Load inbox + empty state | ✅ |
| Search leads | ✅ `filterAndRankRecords` |
| Source filter (website vs estimate request) | ✅ |
| Status filter | ✅ |
| Summary chips (new / contacted counts) | ✅ |
| Quick Call / Email links | ✅ |
| Status dropdown update | ✅ |
| Convert → estimate editor | ✅ Redirect `/estimates/new?edit=` |
| Convert removes lead from active queue | ✅ `converted` hidden |
| Responsive toolbar | ✅ Desktop / tablet / mobile |
| API list merge | ✅ |

---

## UX improvements implemented (this audit)

| Improvement | Why |
|-------------|-----|
| **Redirect after convert** | Eliminates extra navigation to find the new estimate |
| **Removed duplicate status buttons** | Dropdown already supports contacted/completed — less card clutter |
| **Source filter** | Contractors can focus website leads vs form requests |
| **Filter-empty message** | Clear feedback when search/filters hide all rows |
| **Summary bar** | At-a-glance new/contacted counts |
| **Call / Email quick actions** | One tap from card header |
| **Expand long messages** | Saves space; reduces scroll fatigue |
| **Copy suggested reply** | Faster follow-up without retyping AI draft |
| **E2E seed endpoint** | Repeatable audits without manual website form |
| **Contracts: collapsed agreement preview** | Less wasted space on contract library cards |

---

## Contractor usability findings (remaining / future)

### Visual clutter

| Location | Severity | Notes |
|----------|----------|-------|
| Two gradient buttons per card (AI + Convert) | Low | Reduced by removing status quick buttons |
| AI suggest still prominent | Low | Consider secondary placement when AI unavailable |

### Missing reports

| Gap | Severity | Notes |
|-----|----------|-------|
| No funnel report (new → contacted → converted) | Medium | Summary chips are a start |
| No export / print lead sheet | Low | |

### Unnecessary clicks (addressed)

| Was | Now |
|-----|-----|
| Convert then manually open Estimates | Auto-open estimate editor |
| Scroll past full message | Collapsed with expand |

### Missing filtering (addressed)

| Was | Now |
|-----|-----|
| Status only (partial) | Source + status + search |
| No empty-filter message | Added |

### Mobile

| Item | Notes |
|------|-------|
| Toolbar wraps cleanly | ✅ |
| Card 2-column body stacks on narrow | ✅ CSS breakpoint |
| Quick actions full-width tap targets | ✅ |

### Daily-use friction

| Issue | Severity | Notes |
|-------|----------|-------|
| es/pl search labels were English in es block | Medium | Partially fixed in pl; es search still mixed — move to i18n JSON later |
| AI reply requires API key | Info | Error surfaced in notice |
| No SMS deep link | Low | `tel:` / `mailto:` only |
| Duplicate estimate_request rows hidden server-side | Info | Documented in API comment |

---

## E2E evidence

```text
tests/e2e/audit/lead-inbox-module.spec.js — 6/6 passed (2026-05-28)
```

---

## Related

- [LEAD_INBOX_MODULE_SIGN_OFF.md](./LEAD_INBOX_MODULE_SIGN_OFF.md)  
- [UX_PRIORITIZED_BACKLOG.md](./UX_PRIORITIZED_BACKLOG.md)  
- [PRODUCTION_READINESS_REPORT.md](../PRODUCTION_READINESS_REPORT.md)
