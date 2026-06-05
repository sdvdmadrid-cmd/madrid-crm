import "server-only";

const DEFAULT_TTL_SECONDS = Number(
  process.env.API_RESPONSE_CACHE_TTL_SECONDS || 120,
);

async function redisGet(key) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  try {
    const res = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}` },
      next: { revalidate: 0 },
    });
    if (!res.ok) return null;
    const { result } = await res.json();
    return result ? JSON.parse(result) : null;
  } catch {
    return null;
  }
}

async function redisSetEx(key, ttl, value) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return false;

  try {
    const res = await fetch(
      `${url}/setex/${encodeURIComponent(key)}/${ttl}/${encodeURIComponent(JSON.stringify(value))}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    return res.ok;
  } catch {
    return false;
  }
}

async function redisDel(key) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
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

const memoryCache = new Map();
const MAX_MEMORY_ENTRIES = 2000;

function getMemoryCached(key) {
  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    memoryCache.delete(key);
    return null;
  }
  return entry.data;
}

function setMemoryCached(key, data, ttlSeconds) {
  if (memoryCache.size >= MAX_MEMORY_ENTRIES) {
    const firstKey = memoryCache.keys().next().value;
    memoryCache.delete(firstKey);
  }
  memoryCache.set(key, {
    data,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
}

export function isApiResponseCacheEnabled() {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN,
  );
}

/**
 * Read a cached API payload. Tries Upstash first, then in-process memory.
 */
export async function getApiResponseCache(key) {
  const redisValue = await redisGet(`api:${key}`);
  if (redisValue != null) return redisValue;
  return getMemoryCached(key);
}

/**
 * Store an API payload in Upstash (when configured) and in-process memory.
 */
export async function setApiResponseCache(
  key,
  data,
  ttlSeconds = DEFAULT_TTL_SECONDS,
) {
  setMemoryCached(key, data, ttlSeconds);
  await redisSetEx(`api:${key}`, ttlSeconds, data);
}

export async function deleteApiResponseCache(key) {
  memoryCache.delete(key);
  await redisDel(`api:${key}`);
}
