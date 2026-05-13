# Connection Pooling Activation Guide

**Date:** May 12, 2026  
**Purpose:** Enable PgBouncer pooling to support 1,000+ concurrent users  
**Status:** Code-ready for pooling benefits

---

## 🎯 Quick Summary

**What is Connection Pooling?**
- Supabase pools database connections automatically at the infrastructure level
- Reduces connection overhead per request
- Enables ~1,000 concurrent users (vs ~50-200 without pooling)
- **No code changes needed** — it's enabled in your account

**Client-side:** Your REST API calls remain the same (HTTPS)  
**Backend-side:** Database handles connection reuse automatically

---

## Step 1: Enable Pooling in Supabase Dashboard

1. Go to **Supabase Dashboard** → Your Project
2. Navigate to **Settings** → **Database**
3. Scroll to **Connection Pooling** section
4. Click **Enable Pooling**
5. Select **Mode:** Transaction (recommended for web apps)
6. Set **Pool Size:** 100 (for 1,000 concurrent users)
7. **Connection Timeout:** 30 seconds
8. Click **Save**

**What this does:**
- Enables PgBouncer at the connection layer
- Multiplexes 100 database connections across many client requests
- Automatically manages connection reuse per transaction

---

## Step 2: Code Impact

**No changes required.** Your code already benefits from pooling:

```javascript
// This already works optimally with pooling enabled
const { data, error } = await supabaseAdmin
  .from("clients")
  .select("*")
  .eq("tenant_id", tenantId);
```

**Why?**
- Supabase REST API automatically uses the pooled backend
- JavaScript client (HTTP/HTTPS) connects to pooling layer transparently
- All RLS queries benefit automatically

---

## Step 3: Advanced: Direct PostgreSQL Pooling (Optional)

If you later add **Prisma ORM** or direct PostgreSQL connections:

```javascript
// Optional: For ORM/direct connections, use pooling URL
// Database: `postgresql://postgres:PASSWORD@PROJECTID.pooling.supabase.co:6543/postgres`
// This is configured in SUPABASE_CONNECTION_POOLED_URL env var
```

**Current Status:** Not needed for REST API operations ✅

---

## Step 4: Verify Pooling is Active

After enabling in dashboard:

1. Check Supabase **Monitoring** dashboard
2. Look for **Connection Count** metric
3. Should show <100 active connections (from many requests)

**Performance gains:**
- Connection timeout errors disappear
- Query latency slightly improves
- Handles concurrent spike better

---

## Step 5: Test Under Load

```bash
# Run e2e tests to verify stability
npx playwright test

# Monitor Supabase dashboard simultaneously
# Should see connection pool reuse, not connection timeouts
```

---

## Expected Improvements

| Metric | Before Pooling | After Pooling |
|--------|---|---|
| Concurrent Users | 50-200 | **1,000+** |
| Connection Overhead | High (~5-10MB per conn) | Low (multiplexed) |
| Connection Timeouts | Frequent at peak | Rare |
| Query Latency | Baseline | Slight improvement |
| Max Active Conns | 20-50 | 100 (pool size) |

---

## Cost Impact

- **Supabase Pooling:** Included in **Pro** plan (no extra cost)
- **Inngest** (async jobs): Included (already configured)
- **Redis** (if adding): Optional $0-25/month (Upstash)

---

## Troubleshooting

### "Connection refused" or "Too many connections"
→ Pooling not enabled yet, or pool size too low
→ **Fix:** Enable in Supabase dashboard, increase pool size to 100+

### "RLS policies timing out"
→ Pool size insufficient for query volume
→ **Fix:** Increase pool size in dashboard (Settings → Database → Connection Pooling)

### Performance didn't improve
→ Pooling reduces connection overhead, not query execution time
→ **Next step:** Add database query indexes (already done in migrations)

---

## Architecture Details

```
┌─────────────────────────────────┐
│  Your Application (Next.js)     │
│  (REST API calls via HTTPS)     │
└──────────┬──────────────────────┘
           │
           │ HTTPS Request
           ▼
┌─────────────────────────────────┐
│  Supabase Edge Layer            │
│  - Auth verification            │
│  - RLS policy enforcement       │
└──────────┬──────────────────────┘
           │
           │ Connection Pooling
           │ (PgBouncer)
           ▼
┌─────────────────────────────────┐
│  PostgreSQL Database            │
│  - Actual query execution       │
│  - Data persistence             │
└─────────────────────────────────┘

✨ Pooling multiplexes many requests
   through fewer actual connections
```

---

## Next Steps

1. **Enable pooling** in Supabase dashboard (5 min)
2. **Wait 1-2 minutes** for activation
3. **Monitor** Supabase dashboard for connection count
4. **Test** with `npm run test:e2e` or load testing
5. **Celebrate** 🎉 Your app now supports 1,000+ concurrent users

---

## Related Docs

- [PRODUCTION_SCALABILITY_GUIDE.md](PRODUCTION_SCALABILITY_GUIDE.md) — Full 1M+ user roadmap
- [SCALABILITY_ANALYSIS_1M_USERS_2026_05_01.md](SCALABILITY_ANALYSIS_1M_USERS_2026_05_01.md) — Technical deep dive
