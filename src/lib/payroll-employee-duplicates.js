import "server-only";

import { PAYROLL_TABLES } from "@/lib/payroll-constants";
import { serializePayrollEmployee } from "@/lib/payroll-serializer";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { scopeByTenant } from "@/lib/tenant-scope";

function normalizeName(firstName, lastName) {
  return `${String(firstName || "").trim()} ${String(lastName || "").trim()}`
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function normalizePhone(phone) {
  return String(phone || "").replace(/\D/g, "");
}

function employeeMatchKeys(employee) {
  const keys = [];
  const name = normalizeName(employee.firstName, employee.lastName);
  const email = normalizeEmail(employee.email);
  const phone = normalizePhone(employee.phone);
  if (name.length > 2) keys.push({ kind: "name", key: name });
  if (email.includes("@")) keys.push({ kind: "email", key: email });
  if (phone.length >= 7) keys.push({ kind: "phone", key: phone });
  return keys;
}

function buildUnionFind(ids) {
  const parent = new Map(ids.map((id) => [id, id]));
  const find = (id) => {
    const current = parent.get(id);
    if (!current || current === id) return id;
    const root = find(current);
    parent.set(id, root);
    return root;
  };
  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(rb, ra);
  };
  return { find, union };
}

export async function listPayrollEmployeesForTenant({ tenantDbId, role }) {
  const { data, error } = await scopeByTenant(
    supabaseAdmin
      .from(PAYROLL_TABLES.EMPLOYEES)
      .select("*")
      .order("created_at", { ascending: true }),
    { tenantDbId, role },
  );
  if (error) throw new Error(error.message);
  return (data || []).map(serializePayrollEmployee);
}

export async function fetchPayrollHistoryCountsByEmployee({ tenantDbId, role }) {
  const { data, error } = await scopeByTenant(
    supabaseAdmin.from(PAYROLL_TABLES.RUN_ITEMS).select("employee_id"),
    { tenantDbId, role },
  );
  if (error) throw new Error(error.message);
  const counts = new Map();
  for (const row of data || []) {
    const id = String(row.employee_id || "");
    if (!id) continue;
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  return counts;
}

export async function findDuplicateEmployeeGroups({ tenantDbId, role }) {
  const employees = await listPayrollEmployeesForTenant({ tenantDbId, role });
  const historyCounts = await fetchPayrollHistoryCountsByEmployee({ tenantDbId, role });
  const keyBuckets = new Map();
  const employeeReasons = new Map();

  for (const employee of employees) {
    employeeReasons.set(employee.id, new Set());
    for (const { kind, key } of employeeMatchKeys(employee)) {
      const bucketKey = `${kind}:${key}`;
      if (!keyBuckets.has(bucketKey)) keyBuckets.set(bucketKey, []);
      keyBuckets.get(bucketKey).push(employee.id);
      employeeReasons.get(employee.id).add(kind);
    }
  }

  const { find, union } = buildUnionFind(employees.map((e) => e.id));
  for (const ids of keyBuckets.values()) {
    if (ids.length < 2) continue;
    for (let i = 1; i < ids.length; i += 1) union(ids[0], ids[i]);
  }

  const clusters = new Map();
  for (const employee of employees) {
    const root = find(employee.id);
    if (!clusters.has(root)) clusters.set(root, new Set());
    clusters.get(root).add(employee.id);
  }

  return [...clusters.values()]
    .filter((ids) => ids.size >= 2)
    .map((idSet) => {
      const members = employees
        .filter((e) => idSet.has(e.id))
        .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
      const reasons = [...new Set(members.flatMap((m) => [...(employeeReasons.get(m.id) || [])]))];
      const enriched = members.map((employee) => ({
        ...employee,
        payrollHistoryCount: historyCounts.get(employee.id) || 0,
        canPermanentlyDelete: (historyCounts.get(employee.id) || 0) === 0,
      }));
      return {
        reasons,
        employees: enriched,
        suggestedKeepId: enriched[0]?.id || null,
        safeDeleteIds: enriched
          .filter((e) => e.canPermanentlyDelete && e.id !== enriched[0]?.id)
          .map((e) => e.id),
      };
    });
}
