import "server-only";

// Session cache using Upstash Redis REST API (works in Node.js runtime)
// Caches validated JWT sessions for up to SESSION_CACHE_TTL_SECONDS
// to reduce crypto overhead on every authenticated request.

const CACHE_TTL = Number(process.env.SESSION_CACHE_TTL_SECONDS || 300); // 5 min default
const KEY_PREFIX = "sess:";

async function redisGet(key) {
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  try {
    const res = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}` },
      next: { revalidate: 0 }, // bypass Next.js fetch cache
    });
    if (!res.ok) return null;
    const { result } = await res.json();
    return result ? JSON.parse(result) : null;
  } catch {
    return null;
  }
}

async function redisSetEx(key, ttl, value) {
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return;

  try {
    await fetch(`${url}/setex/${encodeURIComponent(key)}/${ttl}/${encodeURIComponent(JSON.stringify(value))}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    // Cache write failure is non-fatal
  }
}

async function redisDel(key) {
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return;

  try {
    await fetch(`${url}/del/${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    // Non-fatal
  }
}

function tokenCacheKey(token) {
  // Only store first 16 chars of token as part of key (never store full token)
  return `${KEY_PREFIX}${token.slice(0, 16)}`;
}

/**
 * Get a cached session payload by raw JWT token.
 * Returns null if not cached or Redis unavailable.
 */
export async function getCachedSession(token) {
  if (!token) return null;
  try {
    return await redisGet(tokenCacheKey(token));
  } catch {
    return null;
  }
}

/**
 * Store a validated session in cache.
 * @param {string} token - Raw JWT
 * @param {object} session - Validated session payload
 */
export async function setCachedSession(token, session) {
  if (!token || !session) return;
  try {
    await redisSetEx(tokenCacheKey(token), CACHE_TTL, session);
  } catch {
    // Non-fatal
  }
}

/**
 * Invalidate a session from cache (call on logout).
 * @param {string} token - Raw JWT
 */
export async function invalidateCachedSession(token) {
  if (!token) return;
  try {
    await redisDel(tokenCacheKey(token));
  } catch {
    // Non-fatal
  }
}
