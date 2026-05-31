# Module audit: Website Builder

**Status:** Complete — **signed off** ([WEBSITE_BUILDER_MODULE_SIGN_OFF.md](./WEBSITE_BUILDER_MODULE_SIGN_OFF.md))  
**Last updated:** 2026-05-28  
**Scope:** Contractor site builder (`/website`), publish flow, public `/sites/{slug}`, lead capture handoff

---

## What this module includes

| Surface | Path / API | Contractor purpose |
|---------|------------|-------------------|
| Builder UI | `/website` (alias `/website-builder`) | 5-step workflow: setup → generate → customize → preview → publish |
| Config API | `GET/POST /api/website-builder` | Draft save, slug, headline, publish flag |
| Publish | `POST /api/website-builder/publish` | Push draft live |
| Unpublish | `POST /api/website-builder/unpublish` | Take site offline |
| Public site | `/sites/{slug}` | Customer-facing site + lead form |
| Lead capture | Public contact API → Lead Inbox | CRM pipeline entry |

---

## Workflows tested

| Workflow | Result |
|----------|--------|
| Load builder shell | ✅ E2E ×3 viewports |
| API returns slug + `/sites/` path | ✅ |
| Publish + public HTML contains headline | ✅ |
| Live site + Lead Inbox CTAs when published | ✅ |
| Unpublish 404 on public URL | ✅ (existing `website-builder-saas.spec.js`) |

---

## UX improvements implemented (this audit)

| Improvement | Why |
|-------------|-----|
| **Lead Inbox link** in top bar when live | Contractors publish but did not know where leads land |
| **Publish notice** mentions Lead Inbox | Closes website → CRM loop |
| **`data-testid`** on shell, view live, view leads | Reliable E2E + future tests |
| Dedicated **`website-builder-module.spec.js`** | Module sign-off evidence |

---

## Contractor usability findings

### Visual clutter / navigation

| Issue | Severity | Notes |
|-------|----------|-------|
| 5-step stepper + top bar + floating bar | Medium | Powerful but busy on mobile |
| Hero preview uses `<h1>` inside editable button | Low | Causes duplicate h1 in DOM (a11y/E2E) — consider `aria-level` |
| Advanced panel hidden behind toggles | Low | OK for power users |

### Unnecessary clicks (partially addressed)

| Was | Now |
|-----|-----|
| Publish then hunt Lead Inbox in nav | **Lead Inbox** button beside View Live Site |

### Missing reports

| Gap | Severity |
|-----|----------|
| No “leads this week” on builder | Medium |
| No publish analytics | Low |

### Daily-use friction

| Issue | Notes |
|-------|-------|
| Unpublished changes warning | Good — `beforeunload` + dirty badge |
| AI generation requires API key | Clear `aiConfigMissing` copy |
| Gallery upload depends on storage bucket | `galleryPersistWarning` exists |
| `/website-builder` vs `/website` dual routes | Nav uses `/website` |

---

## E2E evidence

```text
tests/e2e/audit/website-builder-module.spec.js — 5/5 passed (2026-05-28)
tests/e2e/website-builder-saas.spec.js — publish/public/unpublish (existing)
```

---

## Related

- [WEBSITE_BUILDER_MODULE_SIGN_OFF.md](./WEBSITE_BUILDER_MODULE_SIGN_OFF.md)  
- [MODULE_AUDIT_LEAD_INBOX.md](./MODULE_AUDIT_LEAD_INBOX.md)  
- [UX_PRIORITIZED_BACKLOG.md](./UX_PRIORITIZED_BACKLOG.md)
