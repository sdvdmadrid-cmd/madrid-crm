# Module audit: Reputation (Reviews & Social)

**Status:** Complete — **signed off** ([REPUTATION_MODULE_SIGN_OFF.md](./REPUTATION_MODULE_SIGN_OFF.md))  
**Last updated:** 2026-05-28

---

## Classification legend

| Class | Meaning |
|-------|---------|
| **Fix now** | Shipped this pass |
| **Before production-ready** | Next milestone / platform gate |
| **Future enhancement** | Deferred per [UX_FIX_LEDGER.md](./UX_FIX_LEDGER.md) |

---

## Workflows tested

| Workflow | Result |
|----------|--------|
| Page load + tabs | ✅ E2E |
| Connect Google/Yelp UI | ✅ Visible |
| Reviews search + archive collapse | ✅ UX shipped |
| API list endpoints | ✅ E2E |
| Sync (Google/Yelp) | Partial | Requires API keys — manual/staging |
| Pin / show on website | Partial | UI present; needs synced reviews |

---

## Findings

### Fix now (shipped)

| Issue | Fix |
|-------|-----|
| Reviews tab cluttered (import above list) | Collapsible **Import review to private archive** |
| No search on long review lists | **Search synced reviews** filter |
| Disconnect from website builder | **Website builder** link on reviews tab |
| E2E gaps | `reputation-module.spec.js` + `data-testid` on tabs/cards |

### Fix before production-ready

| Issue | Ledger | Notes |
|-------|--------|-------|
| Sync requires server API keys | — | Document in settings checklist |
| No average rating summary | B-004 area | Dashboard module |
| Manual import vs API verified confusion | — | Copy improved; onboarding tour deferred |

### Future enhancement

| Issue | Ledger | Justification |
|-------|--------|---------------|
| Bulk import CSV | E-004 area | Low volume |
| Review response drafts | — | Not core CRM |

---

## E2E

```text
tests/e2e/audit/reputation-module.spec.js
```

---

## Related

[UX_FIX_LEDGER.md](./UX_FIX_LEDGER.md) · [MODULE_AUDIT_LEAD_INBOX.md](./MODULE_AUDIT_LEAD_INBOX.md)
