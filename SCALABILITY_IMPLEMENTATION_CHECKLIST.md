# Madrid-App Scalability Implementation Checklist

**Project:** Scale madrid-app to 1M+ concurrent users  
**Created:** May 1, 2026  
**Target Timeline:** 18 weeks  
**Team Size:** 2-3 engineers  

---

## PHASE 1: FOUNDATION (Weeks 1-2) → 200K Users

### Database Optimization
- [ ] **Create migration: Add missing indexes** (2h)
  - [ ] `idx_invoices_due_date` on (tenant_id, due_date)
  - [ ] `idx_invoices_created_at_desc` on (created_at DESC)
  - [ ] `idx_payments_status` on (tenant_id, status)
  - [ ] `idx_payments_stripe_session_id` on (stripe_session_id)
  - [ ] `idx_clients_name_search` using GIN (tsvector)
  - [ ] `idx_jobs_due_date_status` on (tenant_id, due_date, status)
  - [ ] `idx_bills_autopay_sweep` on (tenant_id, autopay_enabled, due_date)
  - [ ] `idx_appointments_user_id` on (tenant_id, user_id)
  - **File:** `supabase/migrations/20260501_add_missing_indexes.sql`
  - **Command:** `supabase db push`

- [ ] **Enable PgBouncer Connection Pooling** (1h)
  - [ ] Login to Supabase dashboard
  - [ ] Navigate to Settings → Database
  - [ ] Enable Connection Pooling
  - [ ] Set Mode: Transaction
  - [ ] Set Pool size: 100
  - [ ] Set Connection timeout: 30s
  - [ ] Copy pooled connection URL
  - [ ] Update `.env.production`: `SUPABASE_CONNECTION_POOLED_URL=...`
  - **Verification:** Connect via pooled URL, run SELECT test

### Redis Setup
- [ ] **Setup Upstash Redis** (1h)
  - [ ] Create account: https://upstash.com/
  - [ ] Create Redis database (Starter tier)
  - [ ] Copy REST API URL
  - [ ] Add to `.env.production`: `REDIS_URL=...`
  - [ ] Add to docker-compose.yml (for local dev)
  - **Verification:** `redis-cli ping` returns PONG

- [ ] **Wire Redis to Middleware** (3h)
  - [ ] Modify [middleware.js](middleware.js)
  - [ ] Import `checkRateLimit` from redis-client
  - [ ] Replace in-memory rate limiting with Redis calls
  - [ ] Test rate limiting on local environment
  - [ ] Verify 429 responses trigger correctly
  - **File:** [middleware.js](middleware.js#L10-L80)

### Session Caching
- [ ] **Create Session Cache Layer** (3h)
  - [ ] Create new file: `src/lib/session-cache.js`
  - [ ] Implement `getCachedSession(token)` function
  - [ ] Cache TTL: 5 minutes
  - [ ] Fallback to full validation if Redis unavailable
  - [ ] Add cache invalidation on logout
  - **Test:** Verify auth middleware latency <5ms (was 50-100ms)

- [ ] **Integrate Session Cache in Middleware** (2h)
  - [ ] Modify [src/lib/auth-edge.js](src/lib/auth-edge.js)
  - [ ] Call `getCachedSession()` before full validation
  - [ ] Verify cache hit rate >80%
  - [ ] Monitor cache performance

### Load Testing
- [ ] **Setup Artillery Load Testing** (2h)
  - [ ] Install: `npm install -g artillery`
  - [ ] Create `.load-test.yml` configuration
  - [ ] Define scenarios:
    - [ ] GET /api/invoices?page=1
    - [ ] GET /api/clients
    - [ ] POST /api/invoices (create)
  - [ ] Set phases: ramp to 100 concurrent users over 1 minute
  - [ ] Set duration: 5 minutes sustained

- [ ] **Run Baseline Load Test** (1h)
  - [ ] Execute: `artillery run .load-test.yml`
  - [ ] Capture baseline metrics:
    - [ ] P95 latency: Target <200ms
    - [ ] Error rate: Target <1%
    - [ ] Throughput: Document actual
  - [ ] Save report: `artillery-baseline.json`

- [ ] **Validate Improvements** (1h)
  - [ ] Re-run load test after Phase 1 changes
  - [ ] Verify latency improvement: 50-100ms target
  - [ ] Verify no 429 (rate limit) errors
  - [ ] Compare to baseline

### Environment & Deployment
- [ ] **Update .env.production**
  - [ ] Add `SUPABASE_CONNECTION_POOLED_URL`
  - [ ] Add `REDIS_URL`
  - [ ] Add `ENCRYPTION_KEY` (if not present)
  - [ ] Verify all secrets populated

- [ ] **Update docker-compose.yml**
  - [ ] Add Redis service (if using local Redis)
  - [ ] Set Redis healthcheck
  - [ ] Set max memory: 256mb
  - [ ] Set eviction policy: allkeys-lru

- [ ] **Deploy to Production**
  - [ ] Merge to main branch
  - [ ] Trigger Vercel/Railway deployment
  - [ ] Monitor error rates & latency for 2 hours
  - [ ] Rollback if errors spike >5%

### Phase 1 Validation
- [ ] **Performance Targets Met**
  - [ ] Connection pool: 100 connections active
  - [ ] API latency (p95): <200ms
  - [ ] Rate limiting: Distributed across instances
  - [ ] Session cache hit rate: >80%
  - [ ] Database query latency: 10-50ms (improved from 100-200ms)

- [ ] **System Monitoring**
  - [ ] Setup alerts: Request latency >500ms
  - [ ] Setup alerts: Error rate >1%
  - [ ] Setup alerts: Redis connection fails
  - [ ] Daily metrics review

**Phase 1 Completion Criteria:**
- ✅ Load test shows 50% latency improvement
- ✅ Rate limiting works across instances
- ✅ No errors in production logs
- ✅ Database connections stable at 50-100
- ✅ Session cache hit rate >75%

---

## PHASE 2: RELIABILITY (Weeks 3-6) → 500K Users

### Async Webhooks (Inngest)
- [ ] **Setup Inngest** (2h)
  - [ ] Create account: https://app.inngest.com/
  - [ ] Create app: "madrid-app"
  - [ ] Get Event Key & Base URL
  - [ ] Add to `.env.production`: `INNGEST_EVENT_KEY` & `INNGEST_BASE_URL`
  - **Verification:** Test event creation via Inngest API

- [ ] **Create Webhook Event Handlers** (6h)
  - [ ] Create `src/inngest/functions/stripe-webhook.js`
    - [ ] Handle `stripe/payment.succeeded`
    - [ ] Handle `stripe/payment.failed`
    - [ ] Handle `stripe/checkout.completed`
  - [ ] Create `src/inngest/functions/plaid-webhook.js`
    - [ ] Handle `plaid/transaction.created`
  - [ ] Create `src/inngest/functions/email-webhook.js`
    - [ ] Handle `email/bounce`
    - [ ] Handle `email/complaint`
  - [ ] Implement retry logic: exponential backoff

- [ ] **Modify Webhook Routes to Use Inngest** (4h)
  - [ ] Update [src/app/api/payments/webhooks/stripe](src/app/api/payments/webhooks/stripe)
    - [ ] Change from sync to event publish
    - [ ] Return 200 immediately
    - [ ] Publish event to Inngest
  - [ ] Update bill payment webhook
  - [ ] Update email webhook
  - [ ] Add circuit breaker pattern for failing events

- [ ] **Create Inngest API Routes** (2h)
  - [ ] Create [src/app/api/inngest/[...route].js](src/app/api/inngest/)
    - [ ] Import all event handlers
    - [ ] Setup serve() with all functions
    - [ ] Configure rate limiting per function

- [ ] **Test Webhook Processing** (2h)
  - [ ] Simulate Stripe webhook via CLI
  - [ ] Verify event appears in Inngest dashboard
  - [ ] Verify database updates occur
  - [ ] Check latency: <500ms end-to-end

### Database Query Optimization
- [ ] **Analyze Slow Queries** (4h)
  - [ ] Enable pg_stat_statements in Supabase
  - [ ] Query: SELECT query, mean_exec_time FROM pg_stat_statements
  - [ ] Identify top 10 slow queries
  - [ ] Document query plans with EXPLAIN ANALYZE

- [ ] **Optimize Hot-Path Queries** (6h)
  - [ ] Query: Dashboard metrics (admin overview)
    - [ ] Create materialized view for pre-aggregated data
    - [ ] Refresh on hourly schedule
  - [ ] Query: List invoices with pagination
    - [ ] Verify index usage with EXPLAIN
    - [ ] Add missing column indexes
  - [ ] Query: Revenue dashboard
    - [ ] Implement caching (5-minute TTL)
  - [ ] Query: Payment history by tenant
    - [ ] Add composite index (tenant_id, status, created_at)

- [ ] **Implement Query Caching** (3h)
  - [ ] Create `src/lib/query-cache.js`
    - [ ] Implement Redis-backed query cache
    - [ ] Set TTL: 5-60 minutes (configurable per query)
    - [ ] Add cache invalidation on write operations
  - [ ] Cache these queries:
    - [ ] Dashboard metrics (5 min TTL)
    - [ ] Revenue by status (10 min TTL)
    - [ ] Top clients (30 min TTL)

### Monitoring & Observability
- [ ] **Setup DataDog (or Sentry + custom metrics)** (6h)
  - [ ] Create DataDog account
  - [ ] Install agent: `npm install datadog-browser-rum`
  - [ ] Configure RUM (Real User Monitoring)
  - [ ] Setup APM for backend
  - [ ] Create dashboards for:
    - [ ] Request latency (p50, p95, p99)
    - [ ] Error rates by endpoint
    - [ ] Database query duration
    - [ ] Redis operation latency
    - [ ] Memory usage per instance

- [ ] **Setup Alerts** (2h)
  - [ ] Alert: Request latency >1 second
  - [ ] Alert: Error rate >1%
  - [ ] Alert: Database connections >90
  - [ ] Alert: Redis memory >80%
  - [ ] Alert: Webhook processing lag >5 min
  - [ ] Slack integration for alerts

- [ ] **Performance Baseline** (1h)
  - [ ] Document current metrics:
    - [ ] API latency: {p50, p95, p99}
    - [ ] Error rate by endpoint
    - [ ] Database QPS
    - [ ] Memory usage
  - [ ] Set improvement targets (20-30% latency reduction)

### Testing & Validation
- [ ] **Run Phase 2 Load Test** (2h)
  - [ ] Update artillery config for 500 concurrent users
  - [ ] Run for 10 minutes sustained
  - [ ] Capture metrics:
    - [ ] Throughput: 5,000+ requests/sec
    - [ ] Latency (p95): <150ms
    - [ ] Error rate: <0.1%
  - [ ] Compare to Phase 1 baseline

- [ ] **Webhook Stress Test** (2h)
  - [ ] Simulate 1,000 webhooks/minute for 10 minutes
  - [ ] Verify:
    - [ ] No webhook loss
    - [ ] Processing latency: <500ms
    - [ ] Event queue length: <10K
    - [ ] Database load: normal

- [ ] **Database Stress Test** (2h)
  - [ ] Run: `artillery run .database-load-test.yml`
  - [ ] Test patterns:
    - [ ] 100 concurrent users, each 10 queries/sec
    - [ ] Complex joins (invoices + payments + clients)
    - [ ] Aggregations (revenue by status)
  - [ ] Verify:
    - [ ] Query latency: <200ms (p95)
    - [ ] Connection pool utilization: 50-100 connections

**Phase 2 Completion Criteria:**
- ✅ Webhook processing latency <500ms
- ✅ Database query latency 30-50% faster than Phase 1
- ✅ Monitoring dashboards fully operational
- ✅ No alert spam (noise <5 daily alerts)
- ✅ Load test passes with 500 concurrent users

---

## PHASE 3: GLOBAL SCALE (Weeks 7-18) → 1M Users

### Multi-Region Deployment
- [ ] **Deploy Read Replicas** (20h)
  - [ ] Provision Supabase replicas in:
    - [ ] EU (London)
    - [ ] Asia-Pacific (Tokyo)
    - [ ] Americas (São Paulo)
    - [ ] Middle East (optional)
  - [ ] Configure replication lag monitoring
  - [ ] Setup eventual consistency checks

- [ ] **Implement Geo-Routing** (16h)
  - [ ] Create `src/lib/geo-router.js`
    - [ ] Detect user region (via Vercel headers or IP)
    - [ ] Route reads to closest replica
    - [ ] Route writes to primary
    - [ ] Implement fallback logic
  - [ ] Update [src/lib/supabase-admin.js](src/lib/supabase-admin.js)
    - [ ] Support multiple connection URLs
    - [ ] Implement smart routing
  - [ ] Update middleware to use geo-router

- [ ] **Setup Regional Redis** (8h)
  - [ ] Create Upstash Redis instances in each region
  - [ ] Implement cache sync (publish-subscribe)
  - [ ] Setup cache-busting on data changes
  - [ ] Test cache consistency

- [ ] **Deploy Application to Multiple Regions** (12h)
  - [ ] Vercel: Enable Edge Config + regional functions
  - [ ] Or Deploy to Railway/Heroku in each region
  - [ ] Setup health checks per region
  - [ ] Configure DNS failover (Route 53 or Cloudflare)

### File Storage Optimization
- [ ] **Setup S3/R2 Storage** (4h)
  - [ ] Create Cloudflare R2 bucket (cheaper than S3)
  - [ ] Configure CORS settings
  - [ ] Setup lifecycle policies:
    - [ ] 30 days: Delete temp uploads
    - [ ] 90 days: Archive to cold storage
  - [ ] Enable CDN caching (R2 default)

- [ ] **Implement Signed URLs** (4h)
  - [ ] Create `src/lib/s3-client.js`
    - [ ] Generate signed URLs (15-min expiry)
    - [ ] Per-user access control
    - [ ] Implement virus scanning (optional)
  - [ ] Create [src/app/api/files/upload/route.js](src/app/api/files/upload/)
    - [ ] Generate presigned POST URL
    - [ ] Return URL to client
  - [ ] Create [src/app/api/files/[id]/route.js](src/app/api/files/)
    - [ ] Serve files with proper cache headers
    - [ ] Implement byte-range requests (streaming)

- [ ] **Migrate Existing Files from Database** (6h)
  - [ ] Create migration job:
    - [ ] Find all files in database
    - [ ] Upload to R2
    - [ ] Update database to reference R2 URLs
    - [ ] Implement rollback logic
  - [ ] Test file retrieval
  - [ ] Verify no broken links

- [ ] **Image Optimization** (4h)
  - [ ] Add image resizing middleware (Sharp)
  - [ ] Support formats: WebP, PNG, JPEG
  - [ ] Sizes: thumbnail (200px), medium (500px), large (1000px)
  - [ ] Implement cache-busting via hash

### CDN & Performance
- [ ] **Configure Global CDN** (6h)
  - [ ] Option A: Use Vercel's built-in CDN
  - [ ] Option B: Add Cloudflare Enterprise
  - [ ] Setup cache rules:
    - [ ] Static assets: 1 year
    - [ ] API responses: 5 minutes
    - [ ] User data: 1 minute
  - [ ] Configure custom headers (security, caching)

- [ ] **Optimize Bundle Size** (4h)
  - [ ] Analyze bundle with: `npm run build && npx webpack-bundle-analyzer .next/static/bundles`
  - [ ] Identify large dependencies
  - [ ] Tree-shake unused code (Tailwind)
  - [ ] Target: <500KB main bundle

### Disaster Recovery
- [ ] **Setup Backup Strategy** (4h)
  - [ ] Daily backups to separate region
  - [ ] 30-day retention
  - [ ] Test restore process monthly
  - [ ] Document recovery procedures

- [ ] **Implement Failover** (8h)
  - [ ] Primary region: Automatic failover to secondary
  - [ ] DNS switchover: <1 minute
  - [ ] Database replication lag monitoring
  - [ ] Test failover monthly

- [ ] **Create Runbooks** (4h)
  - [ ] Incident response procedures
  - [ ] Database restore procedures
  - [ ] Region failover procedures
  - [ ] Rollback procedures

### Testing & Validation
- [ ] **Global Load Test** (4h)
  - [ ] Simulate users from all 5 regions
  - [ ] 1,000 concurrent users per region (5,000 total)
  - [ ] Run for 30 minutes sustained
  - [ ] Verify latency <20ms (p95) in all regions

- [ ] **Multi-Region Failover Test** (4h)
  - [ ] Disable primary region
  - [ ] Verify automatic failover to secondary
  - [ ] Verify data consistency
  - [ ] Measure failover time: Target <5 minutes

- [ ] **Cache Consistency Test** (2h)
  - [ ] Update data in primary
  - [ ] Verify cache invalidation in all regions
  - [ ] Measure consistency lag: Target <1 second

**Phase 3 Completion Criteria:**
- ✅ All 5 regions deployed and tested
- ✅ Global latency <20ms (p95)
- ✅ Failover working in <5 minutes
- ✅ File storage in R2 (not database)
- ✅ Uptime: 99.99% (measured over 4 weeks)
- ✅ Load test passes with 1M concurrent users

---

## ONGOING MAINTENANCE

### Monitoring & Alerting
- [ ] Daily metrics review
- [ ] Weekly performance analysis
- [ ] Monthly capacity planning
- [ ] Quarterly load testing

### Security Hardening
- [ ] [ ] DDoS protection (Cloudflare)
- [ ] [ ] Web Application Firewall (WAF)
- [ ] [ ] Rate limiting at edge (Cloudflare Workers)
- [ ] [ ] Security audit quarterly

### Cost Management
- [ ] [ ] Monthly billing review
- [ ] [ ] Reserved instance planning
- [ ] [ ] Unused resource cleanup
- [ ] [ ] Reserved compute optimization

### Documentation
- [ ] [ ] Architecture diagrams
- [ ] [ ] Deployment procedures
- [ ] [ ] Incident response runbooks
- [ ] [ ] Disaster recovery testing

---

## SUCCESS METRICS

### Performance KPIs
| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| API Latency (p95) | <20ms | DataDog RUM |
| API Latency (p99) | <50ms | DataDog RUM |
| Database Query Latency | <100ms | DataDog APM |
| Cache Hit Rate | >95% | Redis metrics |
| Uptime | 99.99% | Synthetic monitoring |

### Scale KPIs
| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| Concurrent Users | 1M | Load testing |
| Requests/sec | 50,000+ | Load testing |
| Webhooks/min | 10,000+ | Inngest metrics |
| Database QPS | 50,000+ | PostgreSQL metrics |

### Cost KPIs
| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| Cost/User | <$0.10 | Monthly billing |
| Infrastructure Cost | $31,800/mo | Billing dashboard |
| Transaction Fees | <20% revenue | Financial reports |

---

## RISK MITIGATION

### Identified Risks
- **Webhook retry storms** → Circuit breaker + exponential backoff
- **Cache stampede** → Cache warming + lock mechanism
- **Multi-region consistency lag** → Eventual consistency checks
- **DDoS attacks** → Rate limiting + WAF
- **Regional outages** → Automated failover

### Contingencies
- If Phase 1 doesn't improve latency by 40% → Re-assess schema design
- If Inngest becomes unreliable → Fallback to SQS/SNS
- If multi-region costs exceed budget → Scale back to 3 regions
- If load test fails at 500K → Focus on query optimization

---

## RESOURCES & CONTACTS

**Slack Channels:**
- #scalability-project
- #performance-team
- #on-call

**Documentation:**
- Scalability Analysis: [SCALABILITY_ANALYSIS_1M_USERS_2026_05_01.md](SCALABILITY_ANALYSIS_1M_USERS_2026_05_01.md)
- Executive Summary: [SCALABILITY_EXECUTIVE_SUMMARY.md](SCALABILITY_EXECUTIVE_SUMMARY.md)

**Tools & Services:**
- Monitoring: DataDog (start free trial)
- Load Testing: Artillery CLI
- Database: Supabase dashboard
- Redis: Upstash console
- Webhooks: Inngest dashboard

**Timeline:**
- Phase 1: May 15 - May 31
- Phase 2: June 1 - June 30
- Phase 3: July 1 - August 15
- Validation: August 16 - August 31

---

**Status:** 🔴 NOT STARTED  
**Last Updated:** May 1, 2026  
**Owner:** Architecture Team
