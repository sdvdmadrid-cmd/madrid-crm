# UX prioritized backlog — contractor platform audit

**Purpose:** Living list of production blockers and usability work, updated as each module is audited.  
**Last updated:** 2026-05-28  
**Modules signed off:** Clients, Estimates, Jobs, Invoices, Payments, Contracts, Lead Inbox (7/16)

---

## Critical production blockers

| Item | Module | Notes |
|------|--------|-------|
| Incomplete module-by-module audit (9 modules remaining) | Platform | Website Builder, Reputation, Service Catalog, Calendar, Dashboard, Settings, Subscriptions, Owner/Admin, etc. |
| Production deploy verification | Platform | Recent PDF routes, `/contracts`, lead-inbox UX may be local-only until merge |
| Owner/Admin & Settings not audited | Admin | RBAC, tenant config, Stripe platform |
| Golden path E2E (lead → client → estimate → job → invoice) | Cross-module | Single continuous spec not yet wired |

---

## High-impact UX improvements

| Item | Module | Status |
|------|--------|--------|
| ~~No contract library / misleading save copy~~ | Contracts | ✅ Shipped `/contracts` + nav |
| ~~Convert lead then hunt for estimate~~ | Lead Inbox | ✅ Redirect to `/estimates/new?edit=` |
| Estimate kanban drawer action overload | Estimates | Open — group secondary actions |
| ~~Contract card body wastes viewport~~ | Contracts | ✅ Collapsible preview |
| Invoice list stale after external payment | Invoices / Payments | Open — refresh on focus |
| No global payment history report | Payments | Open |
| No “open source estimate” from contract card | Contracts | Open — needs `estimate_id` on save |
| Lead Inbox strings in page-local UI object | Lead Inbox | Open — migrate to i18n files |
| Dashboard contracts/leads summary widgets | Dashboard | Open |

---

## Medium-priority usability improvements

| Item | Module | Notes |
|------|--------|-------|
| Status filter shows only statuses present in data | Contracts | Confusing until Signed row exists |
| Category / date filters on contract library | Contracts | Search tokens only today |
| Lead funnel report (new → contacted → converted) | Lead Inbox | Summary chips are interim |
| es/pl incomplete copy on Lead Inbox | Lead Inbox | es search still English in places |
| Many actions per invoice card | Invoices | Wraps on mobile |
| Partial payment UX refresh without reload | Payments | API path works; list stale |
| Jobs list status dropdown filter | Jobs | Search covers status |
| Bill Payments vs Client payments naming | Payments | Guide clarifies; nav still similar |
| AI features without clear “unavailable” state | Multiple | Lead reply, estimators |

---

## Nice-to-have enhancements

| Item | Module | Notes |
|------|--------|-------|
| Batch print contracts | Contracts | Per-row PDF today |
| SMS deep link on leads | Lead Inbox | `sms:` URI |
| Export leads CSV | Lead Inbox | |
| Collapsible financial blocks on job cards | Jobs | Mobile polish |
| Search match highlighting | Multiple | Consistent enhancement |
| Stripe webhook smoke in CI | Payments | Stripe CLI job |
| Full delete-job in jobs module spec | Jobs | Covered in `jobs-files` |

---

## How this list is maintained

1. Each `MODULE_AUDIT_*.md` records module-specific friction.  
2. Shipped fixes move to sign-off docs with strikethrough here.  
3. At platform sign-off, review **Critical** and **High** for release gating.

---

## Related

- [PRODUCTION_READINESS_REPORT.md](../PRODUCTION_READINESS_REPORT.md)  
- Per-module audits in this folder
