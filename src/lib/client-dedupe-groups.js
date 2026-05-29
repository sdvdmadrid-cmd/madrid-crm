import {
  normalizeEmailForMatch,
  normalizeNameForMatch,
  normalizePhoneForMatch,
} from "./import-engine/client-import-validate.js";

function scoreClientCompleteness(client) {
  let score = 0;
  const address = String(client.address || "").trim();
  if (address && /\d/.test(address)) score += 12;
  else if (address) score += 4;
  if (String(client.email || "").trim()) score += 6;
  if (String(client.phone || "").trim()) score += 6;
  if (String(client.city || "").trim()) score += 3;
  if (String(client.company || "").trim()) score += 2;
  if (String(client.notes || "").trim()) score += 2;
  if (String(client.billing_address || "").trim()) score += 2;
  return score;
}

export function pickKeeperClient(clients) {
  return [...clients].sort((a, b) => {
    const scoreDiff =
      scoreClientCompleteness(b) - scoreClientCompleteness(a);
    if (scoreDiff !== 0) return scoreDiff;
    const aTime = new Date(a.created_at || 0).getTime();
    const bTime = new Date(b.created_at || 0).getTime();
    return aTime - bTime;
  })[0];
}

export function mergeFieldsIntoKeeper(keeper, others) {
  const merged = { ...keeper };
  const fields = [
    "name",
    "email",
    "phone",
    "address",
    "city",
    "state",
    "zip_code",
    "company",
    "notes",
    "billing_address",
    "billing_city",
    "billing_state",
    "billing_zip",
  ];

  for (const other of others) {
    for (const field of fields) {
      if (!String(merged[field] || "").trim() && String(other[field] || "").trim()) {
        merged[field] = other[field];
      }
    }
    if (
      merged.billing_same_as_service !== false &&
      other.billing_same_as_service === false
    ) {
      merged.billing_same_as_service = false;
    }
  }

  return merged;
}

/**
 * @param {object[]} rows raw client rows
 * @returns {{ groups: object[] }}
 */
export function findDuplicateClientGroups(rows) {
  const parent = new Map();
  const keyToClientId = new Map();

  function ensure(id) {
    if (!parent.has(id)) parent.set(id, id);
    return id;
  }

  function find(id) {
    const root = ensure(id);
    if (parent.get(root) !== root) {
      parent.set(root, find(parent.get(root)));
    }
    return parent.get(root);
  }

  function union(a, b) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(rb, ra);
  }

  for (const row of rows) {
    const id = row.id;
    ensure(id);

    const keys = [];
    const phoneKey = normalizePhoneForMatch(row.phone);
    const emailKey = normalizeEmailForMatch(row.email);
    const nameKey = normalizeNameForMatch(row.name);
    if (phoneKey) keys.push(`phone:${phoneKey}`);
    if (emailKey) keys.push(`email:${emailKey}`);
    if (nameKey) keys.push(`name:${nameKey}`);

    for (const key of keys) {
      if (keyToClientId.has(key)) {
        union(id, keyToClientId.get(key));
      } else {
        keyToClientId.set(key, id);
      }
    }
  }

  const groupsByRoot = new Map();
  for (const row of rows) {
    const root = find(row.id);
    if (!groupsByRoot.has(root)) groupsByRoot.set(root, []);
    groupsByRoot.get(root).push(row);
  }

  const groups = [];
  for (const clients of groupsByRoot.values()) {
    if (clients.length < 2) continue;
    const keeper = pickKeeperClient(clients);
    const duplicateIds = clients
      .filter((c) => c.id !== keeper.id)
      .map((c) => c.id);
    groups.push({
      keeperId: keeper.id,
      keeperName: keeper.name || "",
      duplicateIds,
      count: clients.length,
      clients,
    });
  }

  return { groups };
}
