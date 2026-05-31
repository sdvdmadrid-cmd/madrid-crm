# UX fix ledger — triage decisions

**Purpose:** Every audit finding gets a decision. No unbounded backlog.  
**Last updated:** 2026-05-28

## Decision keys

| Decision | Meaning |
|----------|---------|
| **Fix now** | Implement in current audit pass (same PR batch as module work) |
| **Before production-ready** | Required before platform sign-off; next milestone |
| **Future enhancement** | Deferred with justification; not blocking |

---

## Fix now (this pass)

| ID | Issue | Module | Status |
|----|-------|--------|--------|
| F-001 | Invoice list stale after Stripe return / other tab | Invoices | ✅ `visibilitychange` refresh |
| F-002 | Contract card cannot open source estimate | Contracts | ✅ `estimate_id` column + deep link |
| F-003 | Status filter missing common statuses | Contracts | ✅ Fixed status options |
| F-004 | Estimate kanban drawer action overload | Estimates | ✅ “More actions” collapse |
| F-005 | Reputation reviews tab clutter (import + list) | Reputation | ✅ Collapsible import + search |
| F-006 | Website → Lead Inbox navigation | Website Builder | ✅ (local, prior pass) |
| F-007 | No today-at-a-glance on calendar | Calendar | ✅ Today's schedule strip |
| F-008 | Service catalog search + website link | Service Catalog | ✅ Search + header link |
| F-009 | Dashboard metrics not actionable; leads hidden | Dashboard | ✅ Links + `leadInbox` metric |
| F-010 | Settings hub missing catalog/website | Settings | ✅ Two hub cards + test ids |
| F-011 | Subscriptions raw fetch + Spanish shell | Subscriptions | ✅ `apiFetch` + EN shell + settings back |

---

## Fix before production-ready

| ID | Issue | Module | Justification if deferred |
|----|-------|--------|-------------------------|
| B-001 | Golden path E2E (lead → invoice) | Cross-module | Needs stable seed data across APIs |
| B-002 | Owner/Admin deep security / RBAC audit | Admin | E2E smoke done; mutation audit remains |
| B-003 | Global payment history report | Payments | New surface; not blocking daily CRM |
| B-004 | Dashboard contracts/reputation widgets | Dashboard | Inbox metric shipped; widgets deferred |
| B-005 | Lead Inbox i18n in JSON files | Lead Inbox | Large string move; no functional block |
| B-006 | AI unavailable states (clear banners) | Multiple | Per-feature API checks |

---

## Future enhancement

| ID | Issue | Module | Justification |
|----|-------|--------|---------------|
| E-001 | Batch print contracts | Contracts | Low frequency |
| E-002 | SMS deep link on leads | Lead Inbox | `tel:`/`mailto:` cover most cases |
| E-003 | Export leads CSV | Lead Inbox | Reporting phase |
| E-004 | Search match highlighting | Multiple | Cosmetic |
| E-005 | Contract category picker from catalog | Contracts | Nice consistency |
| E-006 | Lead funnel analytics page | Lead Inbox | Summary chips sufficient for v1 |

---

## Closed (shipped in milestone df9e7c5 or audit pass)

- Contract library `/contracts`, lead convert redirect, collapsible contract preview, PDF routes, list search fixes.

---

## Related

- [UX_PRIORITIZED_BACKLOG.md](./UX_PRIORITIZED_BACKLOG.md) — release gating summary only  
- Per-module `MODULE_AUDIT_*.md` — module-local **Fix now / Before ready / Future** tables
