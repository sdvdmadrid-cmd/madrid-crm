# Owner Command Center — Production Data Cleanup Report

**Date:** 2026-06-11  
**Environment:** Supabase production (`fhcbnupmdpphzdafmmgd`) / fieldbaseapp.net  
**Scope:** Remove E2E/QA/demo/mock pollution from platform metrics without touching real businesses.

---

## Executive summary

| Phase | Status | Tenants affected |
|-------|--------|------------------|
| Stage 1 — E2E tenant CRM purge | Committed | `8354b6d2-…` only |
| Stage 2+ — Verified test/orphan CRM purge | Committed | 33 allowlisted tenants |
| Post-cleanup audit | Clean | 2 probe slug ids remain (0 CRM rows) |

**Platform metrics (Owner Command Center core tables):**

| Metric | Pre-Stage 1 | Post-Stage 1 | Post-Stage 2+ |
|--------|-------------|--------------|---------------|
| Clients | 653 | 76 | **65** |
| Jobs | 231 | 9 | **0** |
| Estimates | 650 | 36 | **9** |
| Invoices | 400 | 11 | **1** |
| Payments | 124 | 16 | **10** |
| Contracts | 107 | 0 | **0** |
| Invoice revenue | $192,076.99 | $5,407.99 | **$360.00** |

Expected real-business totals after cleanup: **65 clients** (64 Madrid + 1 JMS), **1 invoice** (Madrid), **$360 revenue**.

---

## Protected tenants (verified unchanged)

| Business | Tenant UUID | Clients | Invoices | Revenue |
|----------|-------------|---------|----------|---------|
| Madrid Landscaping | `d38fec7b-adac-4b7f-a46d-2ccadab6e452` | 64 | 1 | $360 |
| JMS ENTERPRICES LLC | `ebb368d8-248d-4986-8fdd-56a4da7a33d8` | 1 | 0 | $0 |
| Susy cleaning services | `6785ddd8-d0a7-4afd-a97e-1ad9f8e377a4` | 0 | 0 | $0 |

Legacy auth slug tenant ids (`sdvdmadrid-1`, `madridsan84`, `susymadrid75`) preserved — zero CRM rows, tied to real auth users.

---

## Records removed (Stages 1 + 2+)

### Stage 1 — E2E tenant `8354b6d2-0c6c-4a95-a16d-3bbb6908c943`

577 clients, 222 jobs, 614 estimates, 389 invoices, 108 payments, 107 contracts, plus extended tables (711 estimate_revisions, etc.). Auth user + profile + 72 audit_logs **preserved** for Playwright.

### Stage 2+ — 33 verified non-production tenants

Categories removed: QA orphans (`ba64a275`, `dbff881a`), demo UUIDs (`11111111-…`), mailinator probes, orphan company profiles, test signup debris.

Aggregate CRM removed in Stage 2+: 11 clients, 9 jobs, 27 estimates, 10 invoices, 6 payments, ~$5,047.99 test invoice revenue.

**Not deleted:** auth.users for mailinator probes or platform super_admins (CRM-only cleanup).

---

## Records preserved

- All Madrid / JMS / Susy CRM and company data  
- Platform operator `owner@fieldbaseapp.net`  
- E2E shell `admin@fieldbase.local` (empty CRM, profile + audit trail)  
- Dev super_admin seeds (`owner@fieldbase.local`)  
- Susy contractor website (no CRM yet)

---

## Tooling (repo)

| Script | Purpose |
|--------|---------|
| `scripts/cleanup/full-production-audit.mjs` | Read-only tenant classification + metrics |
| `scripts/cleanup/execute-stage1-e2e-cleanup.mjs` | Stage 1 E2E tenant CRM purge |
| `scripts/cleanup/execute-stage2-plus-cleanup.mjs` | Stage 2+ allowlist CRM purge |
| `scripts/cleanup/verify-platform-metrics.mjs` | Post-cleanup metric guard |
| `scripts/cleanup/PROTECTED-TENANTS.json` | Hard-coded real tenant guard list |
| `scripts/backup/pre-stage1-logical-backup.mjs` | Logical backup before cleanup |

Execution reports: `.local-secrets/backups/` (gitignored).

---

## Verification (2026-06-11)

| Check | Result |
|-------|--------|
| `npm run test:unit` | 328/328 pass |
| `npm run verify:prod` | All routes OK |
| `npm run deploy:audit` | 15/15 pass |
| `npm run audit:tenant-clients` | 65 clients, 2 tenants (Madrid + JMS only) |
| Post-cleanup full audit | 0 removable CRM rows remaining |

---

## Rollback instructions

1. **Pre-Stage 1 logical backup:** `.local-secrets/backups/pre-stage1-public-data-2026-06-11T22-26-42.sql` (~3.8 MB, 3,974 INSERTs). Restore via `psql` into a maintenance window (test on staging first).
2. **Supabase WALG daily backups:** Project → Database → Backups (PITR not enabled at time of cleanup).
3. **Stage 2 report:** `.local-secrets/backups/stage2-cleanup-report-2026-06-11T22-41-01.json` — per-tenant delete counts for targeted restore.
4. **Do not** re-run cleanup scripts against production without a fresh audit + backup.

---

## Remaining low-risk items (optional future)

- Probe slug tenants `probe-2076316237`, `probe-2094290103` — 0 CRM rows; mailinator auth users may be purged manually if desired.
- E2E tenant audit_logs (72 rows) — optional Stage 1b if Playwright no longer needs history.
