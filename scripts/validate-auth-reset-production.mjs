const BASE_URL = String(
  process.env.AUTH_VALIDATE_BASE_URL ||
    process.env.APP_BASE_URL ||
    process.env.APP_URL ||
    "https://fieldbaseapp.net",
).replace(/\/$/, "");

const TEST_EMAIL = String(process.env.AUTH_VALIDATE_EMAIL || "").trim().toLowerCase();
const RESET_URL = String(process.env.AUTH_VALIDATE_RESET_URL || "").trim();
const NEW_PASSWORD = String(process.env.AUTH_VALIDATE_NEW_PASSWORD || "").trim();

function ok(label, details = "") {
  console.log(`ok - ${label}${details ? ` (${details})` : ""}`);
}

function warn(label, details = "") {
  console.log(`warn - ${label}${details ? ` (${details})` : ""}`);
}

function fail(label, details = "") {
  console.error(`fail - ${label}${details ? ` (${details})` : ""}`);
  process.exitCode = 1;
}

function getSenderDomain(value) {
  const input = String(value || "").trim();
  const match = input.match(/<([^>]+)>/);
  const address = (match?.[1] || input).trim().toLowerCase();
  const atIndex = address.lastIndexOf("@");
  return atIndex === -1 ? "" : address.slice(atIndex + 1);
}

function isLocalUrl(value) {
  try {
    const parsed = new URL(value);
    return ["localhost", "127.0.0.1"].includes(parsed.hostname);
  } catch {
    return false;
  }
}

async function readJson(response) {
  return response.json().catch(() => ({}));
}

function checkEnvVar(name, { required = true, secret = false } = {}) {
  const value = String(process.env[name] || "").trim();
  if (!value) {
    if (required) fail(`${name} configured`);
    else warn(`${name} configured`, "optional/missing");
    return "";
  }
  ok(`${name} configured`, secret ? "present" : value);
  return value;
}

function getSupabasePublicKeyEnv() {
  const publishable = String(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "").trim();
  if (publishable) {
    return { name: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", value: publishable, legacy: false };
  }

  const anon = String(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
  return { name: anon ? "NEXT_PUBLIC_SUPABASE_ANON_KEY" : "", value: anon, legacy: Boolean(anon) };
}

async function checkHealth() {
  const response = await fetch(`${BASE_URL}/api/health`, { cache: "no-store" });
  const body = await readJson(response);
  if (!response.ok || body.success !== true) {
    fail("/api/health healthy", `status=${response.status}`);
    return;
  }
  const keyEnv = body.supabasePublicKeyEnv ? ` supabaseKey=${body.supabasePublicKeyEnv}` : "";
  const legacy = body.usingLegacySupabaseAnonKey ? " legacyAnon=true" : "";
  ok("/api/health healthy", `commit=${body.commitSha || "unknown"}${keyEnv}${legacy}`);
}

async function checkResetPage() {
  const response = await fetch(`${BASE_URL}/reset-password?token=invalid-validation-token`, {
    cache: "no-store",
  });
  const html = await response.text();
  if (!response.ok) {
    fail("/reset-password loads", `status=${response.status}`);
    return;
  }
  ok("/reset-password loads", `status=${response.status}`);
  if (html.includes("prod ·") || html.includes("data-fieldbase-build")) {
    fail("deployment badge removed from reset page HTML");
  } else {
    ok("deployment badge removed from reset page HTML");
  }
}

async function checkForgotPasswordRequest() {
  if (!TEST_EMAIL) {
    warn(
      "forgot-password production email request skipped",
      "set AUTH_VALIDATE_EMAIL to send a real reset email",
    );
    return;
  }

  const response = await fetch(`${BASE_URL}/api/auth/forgot-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: TEST_EMAIL }),
  });
  const body = await readJson(response);
  if (!response.ok) {
    fail(
      "forgot-password production email request accepted",
      `status=${response.status} code=${body.code || "unknown"}`,
    );
    return;
  }
  ok("forgot-password production email request accepted", `status=${response.status}`);
}

function extractResetPayload(urlValue) {
  const parsed = new URL(urlValue);
  const hashParams = new URLSearchParams(parsed.hash.replace(/^#/, ""));
  return {
    token:
      parsed.searchParams.get("token") ||
      parsed.searchParams.get("reset_token") ||
      parsed.searchParams.get("token_hash") ||
      hashParams.get("token") ||
      hashParams.get("token_hash") ||
      "",
    accessToken: hashParams.get("access_token") || "",
    refreshToken: hashParams.get("refresh_token") || "",
  };
}

async function checkResetLinkCanUpdatePassword() {
  if (!RESET_URL || !NEW_PASSWORD) {
    warn(
      "reset link password update skipped",
      "set AUTH_VALIDATE_RESET_URL and AUTH_VALIDATE_NEW_PASSWORD after receiving the email",
    );
    return;
  }

  const payload = extractResetPayload(RESET_URL);
  if (!payload.token && !payload.accessToken) {
    fail("reset link contains token or access_token");
    return;
  }

  const response = await fetch(`${BASE_URL}/api/auth/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, newPassword: NEW_PASSWORD }),
  });
  const body = await readJson(response);
  if (!response.ok || body.success !== true) {
    fail(
      "reset link updates password",
      `status=${response.status} error=${body.error || "unknown"}`,
    );
    return;
  }
  ok("reset link updates password");
}

async function checkSupabaseRedirectAllowList(appUrl, appBaseUrl) {
  const supabaseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const serviceRole = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!supabaseUrl || !serviceRole) {
    warn("Supabase redirect allowlist check skipped", "missing Supabase URL/service role");
    return;
  }

  const response = await fetch(`${supabaseUrl}/auth/v1/settings`, {
    headers: {
      apikey: serviceRole,
      Authorization: `Bearer ${serviceRole}`,
    },
  });
  const body = await readJson(response);
  if (!response.ok) {
    fail("Supabase auth settings readable", `status=${response.status}`);
    return;
  }

  ok("Supabase auth settings readable");
  const siteUrl = body.SITE_URL || body.site_url || "";
  const allowList =
    body.URI_ALLOW_LIST ||
    body.uri_allow_list ||
    body.URI_ALLOWLIST ||
    body.uri_allowlist ||
    [];
  const allowListText = Array.isArray(allowList)
    ? allowList.join("\n")
    : JSON.stringify(allowList);
  const candidates = [appUrl, appBaseUrl]
    .filter(Boolean)
    .map((origin) => `${origin.replace(/\/$/, "")}/reset-password`);

  if (siteUrl) ok("Supabase Site URL returned", siteUrl);
  for (const candidate of candidates) {
    if (allowListText.includes(candidate)) {
      ok("Supabase redirect allowlist contains reset URL", candidate);
    } else {
      fail("Supabase redirect allowlist contains reset URL", candidate);
    }
  }
}

async function checkResendDomain(emailFrom) {
  const provider = String(process.env.EMAIL_PROVIDER || "").trim().toLowerCase();
  const resendKey = String(process.env.RESEND_API_KEY || "").trim();
  const domain = getSenderDomain(emailFrom);

  if (provider !== "resend") {
    warn("Resend domain verification skipped", `EMAIL_PROVIDER=${provider || "(missing)"}`);
    return;
  }
  if (!resendKey) {
    fail("RESEND_API_KEY configured", "required when EMAIL_PROVIDER=resend");
    return;
  }
  if (!domain) {
    fail("EMAIL_FROM sender domain parsed");
    return;
  }

  const response = await fetch("https://api.resend.com/domains", {
    headers: { Authorization: `Bearer ${resendKey}` },
  });
  const body = await readJson(response);
  if (!response.ok) {
    fail("Resend domains readable", `status=${response.status}`);
    return;
  }

  const domains = Array.isArray(body?.data) ? body.data : [];
  const match = domains.find((item) => String(item.name || "").toLowerCase() === domain);
  if (!match) {
    fail("EMAIL_FROM domain exists in Resend", domain);
    return;
  }
  const status = String(match.status || match.verification_status || "").toLowerCase();
  if (status && status !== "verified") {
    fail("EMAIL_FROM domain verified in Resend", `${domain} status=${status}`);
    return;
  }
  ok("EMAIL_FROM domain verified in Resend", domain);
}

console.log(`Auth reset validation target: ${BASE_URL}`);

const appUrl = checkEnvVar("APP_URL", { required: false });
const appBaseUrl = checkEnvVar("APP_BASE_URL", { required: false });
checkEnvVar("NEXT_PUBLIC_SUPABASE_URL", { required: false });
const supabasePublicKey = getSupabasePublicKeyEnv();
if (supabasePublicKey.value) {
  ok(`${supabasePublicKey.name} configured`, "present");
  if (supabasePublicKey.legacy) {
    warn(
      "Supabase public key uses legacy env name",
      "set NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in Vercel production",
    );
  }
} else {
  warn(
    "Supabase public key configured",
    "missing NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and legacy NEXT_PUBLIC_SUPABASE_ANON_KEY in this shell",
  );
}
const emailProvider = checkEnvVar("EMAIL_PROVIDER", { required: false });
const emailFrom = checkEnvVar("EMAIL_FROM", { required: false });
checkEnvVar("RESEND_API_KEY", {
  required: emailProvider.toLowerCase() === "resend",
  secret: true,
});

for (const [name, value] of [
  ["APP_URL", appUrl],
  ["APP_BASE_URL", appBaseUrl],
]) {
  if (value && isLocalUrl(value)) {
    fail(`${name} is not localhost`, value);
  }
}

await checkHealth();
await checkResetPage();
await checkForgotPasswordRequest();
await checkResetLinkCanUpdatePassword();
await checkSupabaseRedirectAllowList(appUrl, appBaseUrl);
await checkResendDomain(emailFrom);

if (process.exitCode) {
  process.exit(process.exitCode);
}
