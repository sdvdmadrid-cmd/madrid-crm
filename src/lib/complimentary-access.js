/**
 * Internal / founder tenants that use FieldBase without SaaS billing.
 * Add more IDs via COMPLIMENTARY_TENANT_IDS (comma-separated) in Vercel.
 */
const BUILTIN_COMPLIMENTARY_TENANT_IDS = [
  "d38fec7b-adac-4b7f-a46d-2ccadab6e452", // madrids landscaping corp (platform owner)
];

let cachedIds = null;

export function getComplimentaryTenantIds() {
  if (cachedIds) return cachedIds;

  const fromEnv = String(process.env.COMPLIMENTARY_TENANT_IDS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  cachedIds = new Set([...BUILTIN_COMPLIMENTARY_TENANT_IDS, ...fromEnv]);
  return cachedIds;
}

export function isComplimentaryTenant(tenantDbId) {
  const id = String(tenantDbId || "").trim();
  if (!id) return false;
  return getComplimentaryTenantIds().has(id);
}

/** Normalize session / auth/me fields for complimentary tenants. */
export function applyComplimentarySessionFields(fields = {}) {
  const complimentary =
    fields.complimentaryAccess === true ||
    isComplimentaryTenant(fields.tenantDbId);

  if (!complimentary) {
    return fields;
  }

  return {
    ...fields,
    isSubscribed: true,
    billPaymentsSubscribed: true,
    trialEndDate: null,
    complimentaryAccess: true,
    hasBusinessAccess: true,
    subscriptionState: "complimentary",
  };
}

export function complimentaryBillingBlockedPayload() {
  return {
    success: false,
    error:
      "This company has complimentary platform access. No SaaS subscription is required.",
  };
}
