# Performance Optimization Guide — EstateFlow CRM

> **Phase 8 — Performance Strategy & Budget**
> Last updated: June 2026

---

## Performance Budget

| Metric | Target | Measurement Method |
|--------|--------|--------------------|
| API response time (p95) | **< 100ms** | `X-Response-Time` header + Vercel Analytics |
| Page load (LCP) | **< 1.5s** | Lighthouse / Web Vitals |
| Time to First Byte (TTFB) | **< 200ms** | Vercel Edge Network |
| AI call setup latency | **< 3s** | Server timing + client-side measurement |
| Database query (p95) | **< 50ms** | Supabase query performance logs |
| Redis operation | **< 5ms** | Redis SLOWLOG |
| Edge middleware | **< 10ms** | `x-vercel-edge-time` header |

---

## 1. Caching Strategy

EstateFlow uses a **multi-tier caching architecture**:

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│  Edge Config │ ──▶ │    Redis     │ ──▶ │  Database    │
│ (Vercel CDN) │     │ (Upstash/iOR)│     │  (Supabase)  │
└─────────────┘     └──────────────┘     └──────────────┘
   Fastest              Fast               Source of Truth
   ~1ms                  ~3ms               ~20-100ms
```

### Cache Layers

#### Layer 1: Edge Config (Vercel)
- **What's cached:** Tenant routing info (slug → tenantId, custom domains)
- **TTL:** 1 hour (`CACHE_TTL.EDGE_CONFIG = 3600`)
- **Location:** `src/lib/routing/edgeConfigCache.ts`
- **Warm on:** Tenant creation/update via `warmTenantCache()`
- **Invalidate on:** Tenant config change via `invalidateTenantCache()` / `invalidateTenantCacheByKeys()`

#### Layer 2: In-Memory (per-instance Map)
- **What's cached:** Tenant configuration lookups
- **TTL:** 5 minutes (`MEMORY_TTL_MS = 300_000`)
- **Location:** `src/lib/cache/tenantCache.ts`
- **Use case:** Repeated lookups within the same serverless instance

#### Layer 3: Redis (distributed)
- **What's cached:** Tenant configuration, rate limit counters, session data
- **TTL:** Configurable per key type
- **Location:** `src/lib/cache/tenantCache.ts`, `src/lib/security/rateLimiter.ts`
- **Use case:** Cross-instance cache, distributed rate limiting

#### Layer 4: Database (source of truth)
- Always falls through to Supabase for cache misses

### Cache Key Patterns

```
tenant:config:<slug>          — Tenant routing config by slug
tenant:slug:<slug>            — Edge Config tenant by slug
tenant:domain:<domain>        — Edge Config tenant by domain
tenant:id:<id>                — Edge Config tenant by UUID
rl:ip:<clientIp>:<window>     — Rate limit counter by IP
rl:login:<clientIp>:<window>  — Login rate limit by IP
rl:user:<userId>:<window>     — User rate limit by user ID
```

---

## 2. Connection Pooling

### Database (PgBouncer — Transaction Mode)

The application uses **Supabase** which handles connection pooling via PgBouncer.

**Recommended connection string format:**
```
DATABASE_URL=postgresql://user:password@host:6543/postgres?pgbouncer=true
```

Note: Use port **6543** (transaction mode) instead of **5432** (session mode).

**PgBouncer settings:**
```
pool_mode = transaction        -- Transaction-level pooling (recommended)
max_client_conn = 1000          -- Max concurrent clients
default_pool_size = 25          -- Connections per user/pair
max_db_connections = 50         -- Total DB connections
```

**Best practices:**
- Keep transactions short — the connection is returned to the pool after each transaction.
- Use `SERVERLESS` mode on Supabase (auto-suspends idle pools).
- Avoid session-level features (temporary tables, `LISTEN/NOTIFY`).

### Redis Connection Pooling

ioredis handles connection pooling internally. Configuration:
```typescript
const redis = new Redis({ maxRetriesPerRequest: 2, lazyConnect: true });
```

- **Pool size:** ioredis uses a single connection (pipelining for concurrency).
- **For higher throughput:** Increase `maxRetriesPerRequest` or use a connection pool (e.g., `generic-pool`).
- **Lazy connect:** Prevents connection at import time — connect on first use.

---

## 3. Database Indexing Strategy

### Must-Have Indexes

```sql
-- Tenant isolation: every tenant-scoped table
CREATE INDEX idx_leads_tenant_id ON leads(tenant_id);
CREATE INDEX idx_properties_tenant_id ON properties(tenant_id);
CREATE INDEX idx_deals_tenant_id ON deals(tenant_id);
CREATE INDEX idx_tasks_tenant_id ON tasks(tenant_id);
CREATE INDEX idx_expenses_tenant_id ON expenses(tenant_id);
CREATE INDEX idx_documents_tenant_id ON documents(tenant_id);
CREATE INDEX idx_attendance_tenant_id ON attendance(tenant_id);
CREATE INDEX idx_commissions_tenant_id ON commissions(tenant_id);
CREATE INDEX idx_calendar_events_tenant_id ON calendar_events(tenant_id);
CREATE INDEX idx_chatbot_sessions_tenant_id ON chatbot_sessions(tenant_id);

-- Lookup indexes
CREATE INDEX idx_users_email ON users(email);                              -- Login lookups
CREATE INDEX idx_tenants_slug ON tenants(slug);                           -- Tenant routing
CREATE INDEX idx_tenants_domain ON tenants(domain);                       -- Custom domain routing
CREATE INDEX idx_leads_phone ON leads(phone);                             -- Phone lookup
CREATE INDEX idx_deals_stage ON deals(stage);                             -- Pipeline views
CREATE INDEX idx_tasks_assigned_to ON tasks(assigned_to);                 -- Task assignment
CREATE INDEX idx_audit_logs_tenant_created ON audit_logs(tenant_id, created_at DESC); -- Audit trail
CREATE INDEX idx_forms_slug ON forms(slug);                              -- Public form access

-- Composite indexes for common query patterns
CREATE INDEX idx_deals_tenant_stage ON deals(tenant_id, stage);
CREATE INDEX idx_leads_tenant_status ON leads(tenant_id, status);
CREATE INDEX idx_tasks_tenant_status ON tasks(tenant_id, status);
CREATE INDEX idx_calendar_events_tenant_date ON calendar_events(tenant_id, start_time);
CREATE INDEX idx_attendance_tenant_date ON attendance(tenant_id, date);
```

### Partial Indexes

```sql
-- Active deals only (exclude closed-won / closed-lost)
CREATE INDEX idx_deals_active ON deals(tenant_id) WHERE stage NOT IN ('closed_won', 'closed_lost');

-- Unread notifications
CREATE INDEX idx_notifications_unread ON notifications(tenant_id, user_id) WHERE read = false;
```

### Query Optimization Tips

1. **Always filter by tenant_id first** — every query should start with `.eq('tenant_id', tenantId)`
2. **Use `.select('column1,column2')`** — never `select('*')` in production
3. **Limit result sets** — use `.range(0, 19)` for pagination (never unbounded queries)
4. **Avoid N+1 queries** — use `.select('*, related_table(*)')` for eager loading
5. **Use `.order()` carefully** — ensure the ordered column is indexed
6. **Profile with `EXPLAIN ANALYZE`** — identify sequential scans
7. **Set statement timeout** — `app.settings.statement_timeout = '10s'`

---

## 4. Frontend Optimization

### React Server Components (RSC)
- **Data fetching** is done in Server Components where possible.
- Client Components are leaf nodes (interactive UI only).
- Default to Server Components — add `'use client'` only when necessary.

### Streaming & Suspense
- Route segments use `loading.tsx` for Suspense boundaries.
- API data is streamed via React Suspense where latency is > 200ms.
- Skeleton components for loading states.

### Image Optimization
- All images use `next/image` with explicit `width` and `height`.
- Remote images allowlisted in `next.config.js` via `remotePatterns`.
- Priority images (LCP candidates) marked with `priority` attribute.
- Lazy loading for below-fold images (default).

### Bundle Optimization
- Dynamic imports for heavy components (charts, maps, PDF viewers).
- `next/dynamic` with `ssr: false` for client-only libraries.
- Tree-shaking via named imports from `lucide-react`, `recharts`, etc.
- TODO: Set up `@next/bundle-analyzer` for periodic bundle audits.

### Tailwind CSS (v4)
- Uses JIT compilation — only used classes are included in the bundle.
- No unused CSS in production builds.

---

## 5. CDN Strategy

| Asset Type | CDN | Caching Strategy |
|------------|-----|------------------|
| Static JS/CSS | Vercel Edge Network | Immutable (hash-based filenames), 1 year |
| Images (user-uploaded) | Supabase Storage CDN | 1 hour, cache-bust via URL versioning |
| Tenant logos | Supabase Storage CDN | 1 day |
| API responses | Vercel Edge Network | No CDN cache (dynamic) — use Edge Config |
| Static pages (ISR) | Vercel Edge Network | `revalidate: 60` seconds |

**Vercel Edge Network automatically:**
- Serves static assets from 100+ locations worldwide.
- Compresses responses (Brotli/gzip).
- Terminates TLS at the edge.

---

## 6. Load Testing Results Template

### Test Configuration
```
Tool:          k6 / artillery
Duration:      5 minutes
Virtual Users: 50 -> 250 (ramp up)
Base URL:      https://<tenant>.estateflow.app
```

### Endpoint Results
| Endpoint | p50 Latency | p95 Latency | p99 Latency | RPS | Error Rate |
|----------|-------------|-------------|-------------|-----|------------|
| `GET /api/leads` | — | — | — | — | — |
| `POST /api/leads` | — | — | — | — | — |
| `GET /api/deals` | — | — | — | — | — |
| `GET /api/properties` | — | — | — | — | — |
| `POST /api/auth/login` | — | — | — | — | — |
| `POST /api/chatbot/widget/message` | — | — | — | — | — |
| `GET /` (page load) | — | — | — | — | — |

### Interpretation
- **p50 < 50ms**: Excellent
- **p95 < 100ms**: Within budget
- **p99 > 200ms**: Investigate — may need query optimization or caching
- **Error rate > 1%**: Investigate — may indicate rate limiting, DB pool exhaustion, or code errors

### Load Testing Command (k6)
```bash
k6 run --vus 50 --duration 5m load-test.js
```

### Sample k6 Script (`load-test.js`)
```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '1m', target: 50 },
    { duration: '3m', target: 200 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<200'],
    http_req_failed: ['rate<0.01'],
  },
};

export default function () {
  const res = http.get('https://demo.estateflow.app/api/leads', {
    headers: { Authorization: `Bearer ${__ENV.TEST_TOKEN}` },
  });
  check(res, { 'status is 200': (r) => r.status === 200 });
  sleep(1);
}
```

---

## 7. Monitoring & Observability

### Metrics to Track (Vercel Analytics)
- **Web Vitals:** LCP, FID/INP, CLS
- **API Response Time:** p50, p95, p99
- **Error Rate:** 4xx and 5xx responses
- **Cache Hit Ratio:** Edge Config + Redis

### Database Monitoring (Supabase)
- Query performance (slow queries > 100ms)
- Connection pool usage
- Index usage statistics
- Sequential scans

### Redis Monitoring
- Memory usage
- Hit rate
- Command latency (SLOWLOG)
- Connection count

### Alert Thresholds
| Metric | Warning | Critical |
|--------|---------|----------|
| API p95 response time | > 150ms | > 300ms |
| Error rate | > 1% | > 5% |
| Redis hit rate | < 80% | < 60% |
| DB connection pool usage | > 70% | > 90% |
| Cache miss rate | > 30% | > 50% |
