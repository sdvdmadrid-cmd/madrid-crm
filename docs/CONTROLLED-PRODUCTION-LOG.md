# FieldBase — Controlled Production Testing Log

**Tenant:** Madrid Landscaping  
**Phase started:** June 2026  
**Status:** Active — real-world validation. **No new features** until this phase completes a stable week.

## Operating rules (this phase)

| Rule | Detail |
|------|--------|
| Scope | Bug fixes only — issues found during daily operations |
| Priority | Stability, reliability, data integrity, UX — in that order for triage |
| Features | Deferred — log ideas in [POST_LAUNCH_BACKLOG.md](./POST_LAUNCH_BACKLOG.md), do not implement |
| Changes | Smallest correct fix; no drive-by refactors |
| Verification | Reproduce on production (or prod-like tenant) before closing |

## Severity levels

| Level | Name | When to use | Response target |
|-------|------|-------------|-----------------|
| **P0** | Critical | Data loss, wrong tenant data, payment/payroll corruption, auth bypass, app unusable | Fix immediately; hotfix deploy |
| **P1** | High | Core workflow blocked (create job, invoice, payroll run, schedule) with no workaround | Fix within 1–2 business days |
| **P2** | Medium | Workflow degraded but workaround exists; repeated errors; mobile unusable for a module | Fix when P0/P1 clear |
| **P3** | Low | Cosmetic, copy, minor perf, nice-to-have | Backlog unless trivial safe fix |

**Focus lenses:** Reliability · Performance · Data integrity · User experience

## How to log an issue

Copy a row into **Active issues** below (or ask in chat with the same fields):

1. **ID** — `LIVE-###` (increment)
2. **Severity** — P0–P3
3. **Module** — CRM, Estimates, Jobs, Calendar, Payroll, Invoices, Reports, etc.
4. **Summary** — One line, user-visible symptom
5. **Steps** — Minimal reproduction
6. **Expected / Actual**
7. **Environment** — Production URL, browser/device, user role
8. **Data impact** — None / possible / confirmed (describe)
9. **Root cause** — Fill when known (API, UI, migration, config, third party)
10. **Fix / PR** — Link or commit when resolved
11. **Status** — Open · Investigating · Fixed · Won't fix (deferred)

**Client errors:** Check `audit_logs` for action `client.error` (same tenant/time window).

Historical pre-launch fixes: [PRODUCTION-BUGS.md](./PRODUCTION-BUGS.md) · Sign-off: [LAUNCH-READINESS-REPORT.md](./LAUNCH-READINESS-REPORT.md)

---

## Infra & CI (P3 — not product bugs)

Tracked here so automated failures are not confused with Madrid Landscaping production issues. Registry ID: **O-10** in [PRODUCTION-BUGS.md](./PRODUCTION-BUGS.md).

| Ref | Sev | Area | Summary | Root cause | Mitigation | Status |
|-----|-----|------|---------|------------|------------|--------|
| **O-10** | P3 | E2E / CI | Core audit subset fails or flakes under parallel Playwright (`--workers=2`) | Timeouts (30s), `net::ERR_ABORTED` / browser closed during `dev-login` in `beforeEach`, API context closed mid-run; load contention — not reproduced as user-facing prod defects | Run subset with `--workers=1`; ensure stable `localhost:3000`; optional longer timeout; see Jun 2026 run: 11 passed, 9 failed, 3 flaky (~15.5m). **Does not block** controlled production use if modules work in browser | Open (deferred) |

**Failed / flaky examples (Jun 2026 run):** `production-readiness` shells (Clients, Estimates, Calendar, Invoices, Payroll, Reports, Business P&L, Equipment); `payroll-module` “Jorge 7×$25” API; retries passed for Dashboard, Jobs, metric links.

```bash
npx playwright test tests/e2e/audit/production-readiness.spec.js tests/e2e/audit/contractor-financial.spec.js tests/e2e/audit/contractor-workflows.spec.js tests/e2e/audit/payroll-module.spec.js tests/e2e/audit/dashboard-module.spec.js --workers=1
```

---

## Active issues (live)

| ID | Sev | Module | Summary | Status | Reported |
|----|-----|--------|---------|--------|----------|
| — | — | — | *No issues logged yet.* | — | — |

---

## Resolved during controlled production

| ID | Sev | Module | Summary | Root cause | Fix | Closed |
|----|-----|--------|---------|------------|-----|--------|
| — | — | — | — | — | — | — |

---

## Weekly ops notes (optional)

| Week | Workflows exercised | Incidents | Notes |
|------|---------------------|-----------|-------|
| | | | |

---

*When you report a bug in chat, reference the ID (e.g. LIVE-001) so fixes stay traceable.*
