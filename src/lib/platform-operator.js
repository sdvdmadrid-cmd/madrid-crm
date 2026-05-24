import "server-only";

/**
 * Emails that must always receive platform operator (super_admin) access.
 * SUPER_ADMIN_EMAILS accepts comma-separated list in addition to SUPER_ADMIN_EMAIL.
 */
export function getPlatformOperatorEmails() {
  const emails = new Set();
  const defaults = [
    "owner@fieldbase",
    "owner@fieldbaseapp.net",
    "owner@fieldbaseapp.com",
  ];
  const single = String(process.env.SUPER_ADMIN_EMAIL || "")
    .trim()
    .toLowerCase();
  const many = String(process.env.SUPER_ADMIN_EMAILS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  for (const email of defaults) {
    emails.add(email);
  }
  if (single) emails.add(single);
  for (const email of many) {
    emails.add(email);
  }

  return emails;
}

export function isPlatformOperatorEmail(email) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized) return false;
  return getPlatformOperatorEmails().has(normalized);
}
