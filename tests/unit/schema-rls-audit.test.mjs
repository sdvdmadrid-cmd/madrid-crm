import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateRlsAuditRows,
  loadRlsExceptions,
} from "../../scripts/lib/evaluate-rls-audit.mjs";

test("evaluateRlsAuditRows flags RLS disabled as critical", () => {
  const { blocking } = evaluateRlsAuditRows([
    {
      table_name: "widgets",
      rls_enabled: "false",
      rls_forced: "false",
      policy_count: "0",
      anon_policies: "0",
      authenticated_policies: "0",
      anon_select_grant: "true",
      auth_select_grant: "true",
    },
  ]);
  assert.ok(blocking.some((f) => f.code === "rls_disabled"));
});

test("evaluateRlsAuditRows allows serviceRoleOnly tables without policies", () => {
  const exceptions = {
    serviceRoleOnly: new Set(["estimate_revisions"]),
    publicAccessApproved: new Set(),
  };
  const { blocking } = evaluateRlsAuditRows(
    [
      {
        table_name: "estimate_revisions",
        rls_enabled: "true",
        rls_forced: "true",
        policy_count: "0",
        anon_policies: "0",
        authenticated_policies: "0",
        anon_select_grant: "false",
        auth_select_grant: "false",
      },
    ],
    exceptions,
  );
  assert.equal(blocking.length, 0);
});

test("evaluateRlsAuditRows flags anon policies without approval", () => {
  const { blocking } = evaluateRlsAuditRows([
    {
      table_name: "secret_leads",
      rls_enabled: "true",
      rls_forced: "true",
      policy_count: "1",
      anon_policies: "1",
      authenticated_policies: "0",
      anon_select_grant: "false",
      auth_select_grant: "true",
    },
  ]);
  assert.ok(blocking.some((f) => f.code === "anon_policy_unapproved"));
});

test("loadRlsExceptions reads repo allowlist", () => {
  const ex = loadRlsExceptions(process.cwd());
  assert.ok(ex.serviceRoleOnly.has("estimate_revisions"));
  assert.ok(ex.publicAccessApproved.has("contractor_websites"));
});
