// Legal system constants and utilities
// Used by both server-side API routes and middleware

// Default version used only to bootstrap per-tenant legal_versions rows.
export const DEFAULT_LEGAL_VERSION = "v1.0-April-2026";

// Backward alias for old imports; do not use as global runtime source of truth.
export const CURRENT_LEGAL_VERSION = DEFAULT_LEGAL_VERSION;

export const LEGAL_COOKIE_NAME = "cf_legal";

// 1 year in seconds
export const LEGAL_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

// Paths that do NOT require legal acceptance (beyond regular auth)
export const LEGAL_BYPASS_PREFIXES = [
  "/legal",
  "/legal-required",
  "/login",
  "/register",
  "/reset-password",
  "/verify-email",
  "/api/auth",
  "/api/legal",
  "/api/public",
  "/api/health",
  "/api/payments/webhooks",
  "/api/email",
  "/_next",
  "/public",
  "/favicon.ico",
  "/robots.txt",
];

export function isLegalBypassPath(pathname) {
  return LEGAL_BYPASS_PREFIXES.some(
    (prefix) =>
      pathname === prefix ||
      pathname.startsWith(prefix + "/") ||
      pathname.startsWith(prefix + "?"),
  );
}

// Helper to get request IP safely
export function getClientIp(request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "unknown";
}

export function buildLegalCookieValue(tenantId, version) {
  const normalizedTenantId = String(tenantId || "").trim();
  const normalizedVersion = String(version || "").trim();
  if (!normalizedTenantId || !normalizedVersion) return "";
  return `${normalizedTenantId}::${normalizedVersion}`;
}

export function parseLegalCookieValue(value) {
  const raw = String(value || "").trim();
  if (!raw) return { tenantId: "", version: "" };

  const separator = raw.indexOf("::");
  if (separator === -1) {
    // Legacy cookie format (version only). Keep parser tolerant.
    return { tenantId: "", version: raw };
  }

  return {
    tenantId: raw.slice(0, separator).trim(),
    version: raw.slice(separator + 2).trim(),
  };
}

// Disclaimer text automatically attached to estimates/invoices
export const ESTIMATE_INVOICE_DISCLAIMER = {
  en: "This document is not legally binding until formally accepted by both parties. Scope, materials, and final pricing may change based on site conditions or client-requested modifications. FieldBase and its operators are not responsible for disputes arising from work performed or payments made outside this platform. All services are subject to the FieldBase Terms & Conditions available at /legal.",
  es: "Este documento no tiene caracter juridicamente vinculante hasta que sea aceptado formalmente por ambas partes. El alcance, los materiales y el precio final pueden cambiar segun las condiciones del sitio o modificaciones solicitadas por el cliente. FieldBase y sus operadores no son responsables de disputas derivadas de trabajos realizados o pagos efectuados fuera de esta plataforma. Todos los servicios estan sujetos a los Terminos y Condiciones de FieldBase disponibles en /legal.",
  pl: "Ten dokument nie jest prawnie wiazacy az do formalnej akceptacji przez obie strony. Zakres, materialy i ostateczna cena moga ulec zmianie w zaleznosci od warunkow terenowych lub zmian zadanych przez klienta. FieldBase i jego operatorzy nie ponosza odpowiedzialnosci za spory wynikajace z prac wykonanych lub platnosci dokonanych poza ta platforma. Wszystkie uslugi podlegaja Regulaminowi FieldBase dostepnemu pod adresem /legal.",
};
