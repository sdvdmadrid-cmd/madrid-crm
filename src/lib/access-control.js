const OWNER_ROLES = new Set(["owner"]);
const ADMIN_ROLES = new Set(["admin"]);
const WORKER_ROLES = new Set(["worker", "contractor"]);
const VIEWER_ROLES = new Set(["viewer"]);

export function normalizeAppRole(role) {
  const normalized = String(role || "")
    .trim()
    .toLowerCase();
  if (normalized === "super_admin") return "super_admin";
  if (OWNER_ROLES.has(normalized)) return "owner";
  if (ADMIN_ROLES.has(normalized)) return "admin";
  if (WORKER_ROLES.has(normalized)) return "worker";
  if (VIEWER_ROLES.has(normalized)) return "viewer";
  return "worker";
}

export function isSuperAdminRole(role) {
  return normalizeAppRole(role) === "super_admin";
}

export function isAdminRole(role) {
  const normalized = normalizeAppRole(role);
  return normalized === "owner" || normalized === "admin" || normalized === "super_admin";
}

export function isWorkerRole(role) {
  return normalizeAppRole(role) === "worker";
}

export function canReadTenantData(role) {
  const normalized = normalizeAppRole(role);
  return (
    normalized === "owner" ||
    normalized === "admin" ||
    normalized === "worker" ||
    normalized === "super_admin"
  );
}

export function canWriteOperationalData(role) {
  const normalized = normalizeAppRole(role);
  return (
    normalized === "owner" ||
    normalized === "admin" ||
    normalized === "worker" ||
    normalized === "super_admin"
  );
}

export function canDeleteRecords(role) {
  return isAdminRole(role);
}

export function canManageSensitiveData(role) {
  return isAdminRole(role);
}

export function canSendExternalCommunications(role) {
  return isAdminRole(role);
}

export function getRoleCapabilities(role) {
  const normalizedRole = normalizeAppRole(role);
  return {
    role: normalizedRole,
    isSuperAdmin: normalizedRole === "super_admin",
    isAdmin: normalizedRole === "admin" || normalizedRole === "super_admin",
    isWorker: normalizedRole === "worker",
    canReadTenantData: canReadTenantData(normalizedRole),
    canWriteOperationalData: canWriteOperationalData(normalizedRole),
    canDeleteRecords: canDeleteRecords(normalizedRole),
    canManageSensitiveData: canManageSensitiveData(normalizedRole),
    canSendExternalCommunications:
      canSendExternalCommunications(normalizedRole),
  };
}
