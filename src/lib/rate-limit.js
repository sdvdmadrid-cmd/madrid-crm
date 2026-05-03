import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";

const RATE_LIMIT_TABLE = "auth_rate_limits";
const WINDOW_MS = 10 * 60 * 1000;
const BLOCK_MS = 15 * 60 * 1000;
const EMAIL_MAX_ATTEMPTS = 8;
const IP_MAX_ATTEMPTS = 30;
const RESET_EMAIL_MAX_ATTEMPTS = 5;
const RESET_IP_MAX_ATTEMPTS = 20;
const PUBLIC_QUOTE_VIEW_IP_MAX_ATTEMPTS = 40;
const PUBLIC_QUOTE_VIEW_TOKEN_MAX_ATTEMPTS = 25;
const PUBLIC_QUOTE_MUTATION_IP_MAX_ATTEMPTS = 15;
const PUBLIC_QUOTE_MUTATION_TOKEN_MAX_ATTEMPTS = 10;
const WEBSITE_LEAD_IP_MAX_ATTEMPTS = 20;
const WEBSITE_LEAD_SLUG_MAX_ATTEMPTS = 12;

const memoryStore = new Map();

function buildKey(scope, value) {
  return `${scope}:${String(value || "unknown")
    .trim()
    .toLowerCase()}`;
}

function nowDate() {
  return new Date();
}

function safeIp(raw) {
  const value = String(raw || "").trim();
  if (!value) return "unknown";
  return value.slice(0, 120);
}

function normalizeState(key, rawState) {
  const now = nowDate();
  if (!rawState) {
    return {
      key,
      count: 0,
      firstAttemptAt: now,
      blockedUntil: null,
      expiresAt: null,
    };
  }

  return {
    key,
    count: Number(rawState.count || 0),
    firstAttemptAt: rawState.first_attempt_at
      ? new Date(rawState.first_attempt_at)
      : rawState.firstAttemptAt
        ? new Date(rawState.firstAttemptAt)
        : now,
    blockedUntil: rawState.blocked_until
      ? new Date(rawState.blocked_until)
      : rawState.blockedUntil
        ? new Date(rawState.blockedUntil)
        : null,
    expiresAt: rawState.expires_at
      ? new Date(rawState.expires_at)
      : rawState.expiresAt
        ? new Date(rawState.expiresAt)
        : null,
  };
}

function isBlocked(state) {
  if (!state.blockedUntil) return false;
  return state.blockedUntil.getTime() > Date.now();
}

function inWindow(state, windowMs) {
  return Date.now() - state.firstAttemptAt.getTime() <= windowMs;
}

function retryAfterSeconds(state) {
  if (!state.blockedUntil) return 1;
  const seconds = Math.ceil((state.blockedUntil.getTime() - Date.now()) / 1000);
  return Math.max(seconds, 1);
}

function buildNextState(state, maxAttempts) {
  const now = nowDate();
  const freshWindow = inWindow(state, WINDOW_MS);
  const nextCount = freshWindow ? state.count + 1 : 1;
  const shouldBlock = nextCount >= maxAttempts;
  const blockedUntil = shouldBlock ? new Date(now.getTime() + BLOCK_MS) : null;
  const expiresAt = new Date(now.getTime() + Math.max(WINDOW_MS, BLOCK_MS) * 4);

  return {
    key: state.key,
    count: nextCount,
    firstAttemptAt: freshWindow ? state.firstAttemptAt : now,
    blockedUntil,
    expiresAt,
    updatedAt: now,
  };
}

async function readState(key) {
  const memoryState = memoryStore.get(key);
  if (memoryState) {
    if (
      memoryState.expiresAt &&
      memoryState.expiresAt.getTime() <= Date.now()
    ) {
      memoryStore.delete(key);
    } else {
      return normalizeState(key, memoryState);
    }
  }

  const { data, error } = await supabaseAdmin
    .from(RATE_LIMIT_TABLE)
    .select("key, count, first_attempt_at, blocked_until, expires_at")
    .eq("key", key)
    .maybeSingle();

  if (error) {
    return normalizeState(key, null);
  }

  return normalizeState(key, data);
}

async function writeState(nextState) {
  memoryStore.set(nextState.key, nextState);

  const { error } = await supabaseAdmin.from(RATE_LIMIT_TABLE).upsert(
    {
      key: nextState.key,
      count: nextState.count,
      first_attempt_at: nextState.firstAttemptAt.toISOString(),
      blocked_until: nextState.blockedUntil
        ? nextState.blockedUntil.toISOString()
        : null,
      expires_at: nextState.expiresAt
        ? nextState.expiresAt.toISOString()
        : null,
      updated_at: nextState.updatedAt.toISOString(),
    },
    { onConflict: "key" },
  );

  if (!error) {
    memoryStore.delete(nextState.key);
  }
}

async function clearState(key) {
  memoryStore.delete(key);
  await supabaseAdmin.from(RATE_LIMIT_TABLE).delete().eq("key", key);
}

export function getRequestIp(request) {
  const forwarded = request.headers.get("x-forwarded-for") || "";
  const firstForwarded = forwarded.split(",")[0]?.trim();

  return safeIp(
    firstForwarded ||
      request.headers.get("x-real-ip") ||
      request.headers.get("cf-connecting-ip") ||
      request.headers.get("x-client-ip") ||
      "unknown",
  );
}

export async function checkLoginRateLimit({ email, ip }) {
  const checks = [
    { key: buildKey("login:email", email) },
    { key: buildKey("login:ip", ip) },
  ];

  for (const check of checks) {
    const state = await readState(check.key);
    if (isBlocked(state)) {
      return {
        allowed: false,
        retryAfterSeconds: retryAfterSeconds(state),
      };
    }
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

export async function recordFailedLoginAttempt({ email, ip }) {
  const checks = [
    { key: buildKey("login:email", email), maxAttempts: EMAIL_MAX_ATTEMPTS },
    { key: buildKey("login:ip", ip), maxAttempts: IP_MAX_ATTEMPTS },
  ];

  for (const check of checks) {
    const state = await readState(check.key);
    const nextState = buildNextState(state, check.maxAttempts);
    await writeState(nextState);
  }
}

export async function clearLoginRateLimit({ email, ip }) {
  await Promise.all([
    clearState(buildKey("login:email", email)),
    clearState(buildKey("login:ip", ip)),
  ]);
}

export async function checkPasswordResetRateLimit({ email, ip }) {
  const checks = [
    { key: buildKey("reset:email", email) },
    { key: buildKey("reset:ip", ip) },
  ];

  for (const check of checks) {
    const state = await readState(check.key);
    if (isBlocked(state)) {
      return {
        allowed: false,
        retryAfterSeconds: retryAfterSeconds(state),
      };
    }
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

export async function recordPasswordResetAttempt({ email, ip }) {
  const checks = [
    {
      key: buildKey("reset:email", email),
      maxAttempts: RESET_EMAIL_MAX_ATTEMPTS,
    },
    { key: buildKey("reset:ip", ip), maxAttempts: RESET_IP_MAX_ATTEMPTS },
  ];

  for (const check of checks) {
    const state = await readState(check.key);
    const nextState = buildNextState(state, check.maxAttempts);
    await writeState(nextState);
  }
}

async function checkScopedRateLimit(checks) {
  for (const check of checks) {
    const state = await readState(check.key);
    if (isBlocked(state)) {
      return {
        allowed: false,
        retryAfterSeconds: retryAfterSeconds(state),
      };
    }
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

async function recordScopedAttempt(checks) {
  for (const check of checks) {
    const state = await readState(check.key);
    const nextState = buildNextState(state, check.maxAttempts);
    await writeState(nextState);
  }
}

export async function checkPublicQuoteRateLimit({
  token,
  ip,
  action = "view",
}) {
  return checkScopedRateLimit(
    [
      {
        key: buildKey(`public-quote:${action}:ip`, ip),
      },
      {
        key: buildKey(`public-quote:${action}:token`, token),
      },
    ].filter(Boolean),
  );
}

export async function recordPublicQuoteAttempt({ token, ip, action = "view" }) {
  const isMutation = action !== "view";
  return recordScopedAttempt([
    {
      key: buildKey(`public-quote:${action}:ip`, ip),
      maxAttempts: isMutation
        ? PUBLIC_QUOTE_MUTATION_IP_MAX_ATTEMPTS
        : PUBLIC_QUOTE_VIEW_IP_MAX_ATTEMPTS,
    },
    {
      key: buildKey(`public-quote:${action}:token`, token),
      maxAttempts: isMutation
        ? PUBLIC_QUOTE_MUTATION_TOKEN_MAX_ATTEMPTS
        : PUBLIC_QUOTE_VIEW_TOKEN_MAX_ATTEMPTS,
    },
  ]);
}

export async function checkWebsiteLeadRateLimit({ slug, ip }) {
  return checkScopedRateLimit([
    { key: buildKey("website-lead:ip", ip) },
    { key: buildKey("website-lead:slug", slug) },
  ]);
}

export async function recordWebsiteLeadAttempt({ slug, ip }) {
  return recordScopedAttempt([
    {
      key: buildKey("website-lead:ip", ip),
      maxAttempts: WEBSITE_LEAD_IP_MAX_ATTEMPTS,
    },
    {
      key: buildKey("website-lead:slug", slug),
      maxAttempts: WEBSITE_LEAD_SLUG_MAX_ATTEMPTS,
    },
  ]);
}
