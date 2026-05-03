import "server-only";
import { createClient } from "redis";

let redisClient = null;
let isConnecting = false;

/**
 * Get or create Redis client
 * Supports both local development (localhost:6379) and production (Upstash URL)
 */
export async function getRedisClient() {
  if (redisClient) {
    return redisClient;
  }

  if (isConnecting) {
    // Wait for existing connection attempt
    let attempts = 0;
    while (!redisClient && attempts < 30) {
      await new Promise((r) => setTimeout(r, 100));
      attempts++;
    }
    return redisClient;
  }

  isConnecting = true;

  try {
    const redisUrl =
      process.env.REDIS_URL || process.env.UPSTASH_REDIS_URL;

    if (!redisUrl) {
      console.warn(
        "[Redis] REDIS_URL not configured. Rate limiting will be in-memory only."
      );
      isConnecting = false;
      return null;
    }

    redisClient = createClient({
      url: redisUrl,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            console.error("[Redis] Max reconnection attempts reached");
            return new Error("Max reconnection attempts");
          }
          return retries * 100;
        },
      },
    });

    redisClient.on("error", (err) => {
      console.error("[Redis] Error:", err);
      redisClient = null;
    });

    redisClient.on("connect", () => {
      console.log("[Redis] Connected successfully");
    });

    await redisClient.connect();
    isConnecting = false;
    return redisClient;
  } catch (error) {
    console.error("[Redis] Connection failed:", error);
    isConnecting = false;
    return null;
  }
}

/**
 * Rate limit using Redis (distributed, production-ready)
 * Falls back to in-memory if Redis unavailable
 */
const inMemoryStore = new Map();

export async function checkRateLimit(
  key,
  limit,
  windowMs = 60000
) {
  try {
    const redis = await getRedisClient();

    if (redis) {
      // Redis-backed rate limiting
      const count = await redis.incr(key);

      if (count === 1) {
        // First request in this window
        await redis.expire(key, Math.ceil(windowMs / 1000));
      }

      return count <= limit;
    }
  } catch (error) {
    console.error("[Rate Limit] Redis check failed:", error);
  }

  // Fallback to in-memory
  const now = Date.now();
  const entry = inMemoryStore.get(key);

  if (!entry || now - entry.windowStart > windowMs) {
    inMemoryStore.set(key, { count: 1, windowStart: now });

    // Prune old entries
    if (inMemoryStore.size > 5000) {
      const cutoff = now - windowMs;
      for (const [k, v] of inMemoryStore) {
        if (v.windowStart < cutoff) inMemoryStore.delete(k);
      }
    }

    return true;
  }

  entry.count += 1;
  return entry.count <= limit;
}

/**
 * Get remaining requests in current window
 */
export async function getRateLimitRemaining(
  key,
  limit,
  windowMs = 60000
) {
  try {
    const redis = await getRedisClient();

    if (redis) {
      const ttl = await redis.ttl(key);
      if (ttl === -2) {
        return limit; // Key doesn't exist
      }

      const count = await redis.get(key);
      return Math.max(0, limit - parseInt(count || "0", 10));
    }
  } catch (error) {
    console.error("[Rate Limit] Failed to get remaining:", error);
  }

  // Fallback to in-memory
  const entry = inMemoryStore.get(key);
  if (!entry) return limit;
  return Math.max(0, limit - entry.count);
}

/**
 * Clear rate limit for a key (admin reset)
 */
export async function clearRateLimit(key) {
  try {
    const redis = await getRedisClient();
    if (redis) {
      await redis.del(key);
    }
  } catch (error) {
    console.error("[Rate Limit] Failed to clear:", error);
  }

  inMemoryStore.delete(key);
}

/**
 * Close Redis connection gracefully
 */
export async function closeRedis() {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}
