# Production Scalability Guide for 1000+ Users

**Date:** May 1, 2026  
**Target Capacity:** 1,000+ concurrent users  
**Current Baseline:** 50-200 concurrent users

---

## 📋 Implementation Checklist

### Phase 1: Critical Security & Performance Fixes ✅ COMPLETED
- [x] Encryptplaid access tokens (was plaintext in DB)
- [x] Reduce file upload limits (4.5MB → 1MB)
- [x] Reduce pagination limits (200-250 → 50-100)
- [x] Improve rate limiting middleware
- [x] Add production config validation
- [x] Add Redis client library
- [x] Add encryption library
- [x] Add Inngest async queue library

### Phase 2: Database Optimization (Priority: HIGH)

#### 2.1 Enable PgBouncer Connection Pooling
**Why:** PostgreSQL connections are expensive; each uses ~5-10MB RAM. Limit prevents connection exhaustion.

**Action:**
```sql
-- In Supabase dashboard, enable connection pooling:
-- Settings → Database → Connection Pooling
-- Mode: Transaction
-- Pool size: 50-100 (depends on plan)
-- Connection timeout: 30 seconds

-- After enabling, use pooled connection string instead of direct:
-- BEFORE: postgresql://user:pass@db.*.supabase.co:5432/postgres
-- AFTER: postgresql://user:pass@db.*.supabase.co:6543/postgres
```

**Environment Variables:**
```env
# Add to .env.production
SUPABASE_CONNECTION_POOLED_URL=postgresql://user:pass@db.REGION.supabase.co:6543/postgres
```

**Code Update Required:**
```javascript
// src/lib/supabase-admin-pooled.js (create new file)
// Use pooled connection for read-heavy operations
```

**Expected Impact:** Support 500+ concurrent users

---

#### 2.2 Add Database Indexes for Hot Paths
```sql
-- Already present in migrations, verify:
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_invoices_tenant_status 
  ON public.invoices(tenant_id, status);
  
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_tenant_created
  ON public.payments(tenant_id, created_at DESC);
  
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bills_tenant_status
  ON public.bills(tenant_id, status, due_date);

-- Analyze query performance:
EXPLAIN ANALYZE SELECT * FROM invoices WHERE tenant_id = $1 AND status = 'paid';
```

**Expected Impact:** 3-5x faster queries

---

### Phase 3: Rate Limiting with Redis (Priority: HIGH)

#### 3.1 Setup Upstash Redis (Recommended for Serverless)
**Cost:** $0-25/month  
**Link:** https://upstash.com/redis

1. Create account
2. Create Redis database
3. Copy REST API URL
4. Add to environment:

```env
REDIS_URL=redis://default:PASSWORD@REGION.upstash.io:PORT
# or use Upstash Redis REST
UPSTASH_REDIS_URL=redis://default:PASSWORD@REGION.upstash.io:PORT
```

#### 3.2 Implement Redis-backed Rate Limiting API
Already implemented in `src/lib/redis-client.js`

**Usage in API routes:**
```javascript
import { checkRateLimit } from "@/lib/redis-client";

export async function POST(request) {
  const userId = session.userId;
  const key = `rate-limit:${userId}:api/invoices`;
  
  const allowed = await checkRateLimit(key, 100, 60000); // 100 per minute
  if (!allowed) {
    return Response.json(
      { error: "Rate limit exceeded" },
      { status: 429 }
    );
  }
  
  // Process request
}
```

**Expected Impact:** 
- Distributed rate limiting across instances
- Support 1000+ concurrent users

---

### Phase 4: Async Webhooks with Inngest (Priority: MEDIUM)

#### 4.1 Setup Inngest
**Cost:** Free tier available  
**Link:** https://www.inngest.com

1. Sign up at https://app.inngest.com
2. Create app "madrid-app"
3. Get Event Key and Base URL:

```env
INNGEST_EVENT_KEY=your-event-key-here
INNGEST_BASE_URL=https://inngest.com/api/v1
```

#### 4.2 Create Inngest Handler Routes
Already implemented in `src/lib/inngest.js`

**Create `/app/api/inngest/[...route].js`:**
```javascript
import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest";

// Import your event handlers
import { handleStripeWebhook } from "@/inngest/functions/stripe";
import { handleBillPayment } from "@/inngest/functions/bill-payment";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    handleStripeWebhook,
    handleBillPayment,
    // ... more handlers
  ],
});
```

#### 4.3 Move Webhook Processing to Async
**Before (synchronous - blocks API):**
```javascript
// POST /api/payments/webhooks/stripe
export async function POST(request) {
  const event = stripe.webhooks.constructEvent(...);
  
  // Process immediately (can timeout)
  await updateInvoiceStatus(event.data);
  await sendNotification(event.data);
}
```

**After (asynchronous - returns immediately):**
```javascript
// POST /api/payments/webhooks/stripe
import { sendInngestEvent } from "@/lib/inngest";

export async function POST(request) {
  const event = stripe.webhooks.constructEvent(...);
  
  // Queue async processing
  await sendInngestEvent("stripe/webhook.received", {
    event,
    receivedAt: new Date().toISOString(),
  });
  
  // Return immediately (webhook acknowledged)
  return Response.json({ success: true });
}
```

**Expected Impact:**
- API responses return in <100ms
- Webhooks processed independently
- Support 2000+ webhooks/minute

---

### Phase 5: Session Caching with Redis (Priority: MEDIUM)

#### 5.1 Cache Session Tokens
**Current:** JWT validation happens on every middleware call  
**Optimized:** Cache validated sessions in Redis for 1-5 minutes

```javascript
// src/lib/session-cache.js
export async function getCachedSession(token) {
  const redis = await getRedisClient();
  if (!redis) return null; // Fallback to full validation
  
  const cached = await redis.get(`session:${token}`);
  if (cached) return JSON.parse(cached);
  
  // Validate and cache
  const session = await verifyEdgeSessionToken(token);
  if (session) {
    await redis.setex(
      `session:${token}`,
      300, // 5 minutes
      JSON.stringify(session)
    );
  }
  return session;
}
```

**Expected Impact:**
- 50-80% reduction in JWT validation calls
- Auth middleware latency: 1-5ms (from 50-100ms)

---

### Phase 6: Performance Monitoring (Priority: MEDIUM)

#### 6.1 Add Metrics
```javascript
// src/lib/metrics.js
export async function recordMetric(name, value, tags = {}) {
  // Send to your monitoring service (DataDog, New Relic, etc.)
  console.log(`[METRIC] ${name}: ${value}`, tags);
}

// Usage:
import { recordMetric } from "@/lib/metrics";

export async function POST(request) {
  const start = Date.now();
  
  try {
    // ... process request
  } finally {
    const duration = Date.now() - start;
    await recordMetric("api.request.duration", duration, {
      endpoint: "/api/invoices",
      status: response.status,
    });
  }
}
```

#### 6.2 Database Query Monitoring
```sql
-- Identify slow queries
SELECT 
  query,
  calls,
  mean_exec_time,
  total_exec_time
FROM pg_stat_statements
WHERE query NOT LIKE '%pg_stat%'
ORDER BY mean_exec_time DESC
LIMIT 20;
```

---

## 🚀 Deployment Strategy for 1000+ Users

### Option A: Vercel (Recommended)
**Pros:**
- Auto-scaling serverless functions
- Native Next.js support
- Built-in CDN

**Configuration:**
```json
{
  "buildCommand": "npm run build",
  "outputDirectory": ".next",
  "env": {
    "REDIS_URL": "@upstash_redis_url",
    "ENCRYPTION_KEY": "@encryption_key",
    "INNGEST_EVENT_KEY": "@inngest_event_key"
  }
}
```

**Max capacity:** 5000+ concurrent users

### Option B: Railway / Heroku (Self-hosted Node)
**Pros:**
- Better memory management
- Persistent connections
- Custom configurations

**Setup:**
```bash
# Create Dockerfile
FROM node:20-alpine
RUN npm ci --only=production
CMD ["npm", "start"]

# Deploy with docker
railway up
# or
git push heroku main
```

**Max capacity:** 1000+ concurrent users

---

## 📊 Capacity Projections

| Component | Current | After Phase 1 | After Phase 3 | After Phase 4 | After Phase 5 |
|-----------|---------|---------------|---------------|---------------|---------------|
| **Concurrent Users** | 50-200 | 200-500 | 500-1000 | 1000-2000 | 2000-5000 |
| **Requests/second** | 100-200 | 300-500 | 1000-1500 | 2000-3000 | 3000-5000 |
| **Webhook throughput** | 100/min | 200/min | 500/min | 2000/min | 5000/min |
| **DB connections** | 20-50 | 30-80 | 50-100 | 50-100 | 50-100 |
| **API latency (p95)** | 200-500ms | 100-300ms | 50-150ms | 50-100ms | 20-50ms |
| **Est. cost/month** | $25 | $50 | $150-200 | $200-250 | $300-400 |

---

## ✅ Next Steps

1. **Immediate (This week):**
   - [ ] Deploy Redis (Upstash) - estimated 1 hour
   - [ ] Update .env.production with Redis URL
   - [ ] Validate deployment works with Redis disabled

2. **Short-term (This month):**
   - [ ] Enable PgBouncer connection pooling
   - [ ] Setup Inngest for async webhooks
   - [ ] Implement session caching

3. **Medium-term (Next quarter):**
   - [ ] Add monitoring/observability
   - [ ] Performance testing with 1000+ concurrent users
   - [ ] Optimize slow queries
   - [ ] Consider multi-region deployment

---

## 🔍 Monitoring Commands

```bash
# Check Redis connection
redis-cli ping

# Monitor rate limit keys
redis-cli KEYS "rate-limit:*" | wc -l

# Check database connections
SELECT count(*) FROM pg_stat_activity;

# Inngest event queue status
curl https://app.inngest.com/api/v1/events?limit=10
```

---

## 📚 References
- [Vercel Serverless Functions](https://vercel.com/docs/serverless-functions/introduction)
- [Upstash Redis](https://upstash.com/docs)
- [Inngest Event-driven jobs](https://www.inngest.com/docs)
- [PgBouncer Connection Pooling](https://www.pgbouncer.org/)
- [PostgREST Performance Tuning](https://postgrest.org/en/v11/tutorials/taming-wild-equines.html)
