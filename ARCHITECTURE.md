# EstateFlow CRM — Architecture Document

> **Version:** 1.0.0  
> **Last Updated:** June 2026  
> **Stack:** Next.js 15 (App Router) + Supabase (PostgreSQL) + Redis (Upstash) + Vercel Edge Config

---

## Table of Contents

1. [System Architecture Overview](#1-system-architecture-overview)
2. [Multi-Tenant Routing Flow](#2-multi-tenant-routing-flow)
3. [Database Schema Overview](#3-database-schema-overview)
4. [Security Architecture](#4-security-architecture)
5. [AI Voice Agent Flow](#5-ai-voice-agent-flow)
6. [White-Label System](#6-white-label-system)
7. [Performance Optimization Strategies](#7-performance-optimization-strategies)
8. [File Structure Map](#8-file-structure-map)

---

## 1. System Architecture Overview

### 1.1 High-Level Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Browser / PWA                                   │
│                     (React 19 + Next.js 15 App Router)                       │
└─────────────────────────────────┬───────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Vercel Edge Network (CDN + Edge Runtime)                   │
│                                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌────────────────┐   │
│  │  Middleware   │  │  API Routes  │  │  Server      │  │  Static Assets │   │
│  │  (Edge)       │  │  (Edge/Node) │  │  Components  │  │  (CDN)         │   │
│  │  - Routing    │  │  - CRUD API  │  │  - RSC       │  │  - Images      │   │
│  │  - Auth       │  │  - Webhooks  │  │  - SSR       │  │  - Fonts       │   │
│  │  - Rate Limit │  │  - Auth API  │  │  - Streaming │  │  - JS/CSS      │   │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └────────────────┘   │
└─────────┼─────────────────┼─────────────────┼────────────────────────────────┘
          │                 │                 │
          ▼                 ▼                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Service Layer (Edge/Node)                           │
│                                                                              │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐ │
│  │   Auth     │ │   AI       │ │  Comm-     │ │  Payments  │ │  Security  │ │
│  │  (JWT)     │ │  Voice     │ │  unication │ │  (Razorpay)│ │  (Encrypt) │ │
│  └────────────┘ └────────────┘ └────────────┘ └────────────┘ └────────────┘ │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐               │
│  │  Routing   │ │  White-    │ │  Chatbot   │ │  Notif-    │               │
│  │  (Tenant)  │ │  Label     │ │  (AI)      │ │  ications  │               │
│  └────────────┘ └────────────┘ └────────────┘ └────────────┘               │
└─────────────────────────────────────────────────────────────────────────────┘
          │                 │                 │
          ▼                 ▼                 ▼
┌────────────┐    ┌────────────┐    ┌────────────────────┐
│  Supabase  │    │  Upstash   │    │  Vercel Edge       │
│ (Postgres) │    │  (Redis)   │    │  Config            │
│  - RLS     │    │  - Cache   │    │  - Tenant Routing  │
│  - Auth    │    │  - Rate    │    │  - Feature Flags   │
│            │    │    Limiter │    │                    │
└────────────┘    └────────────┘    └────────────────────┘
```

### 1.2 Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Framework** | Next.js 15 App Router | Full-stack React, RSC, edge runtime, middleware |
| **Database** | Supabase PostgreSQL | Managed Postgres with RLS, realtime, auth built-in |
| **Cache** | Upstash Redis | Edge-compatible, serverless, global |
| **Routing Cache** | Vercel Edge Config | Fast reads at edge, perfect for tenant lookups |
| **Auth** | JWT + Supabase Auth | Stateless, multi-tenant ready |
| **AI Voice** | Bland AI / Retell AI / Vapi | Multi-provider for redundancy & cost optimization |
| **Payments** | Razorpay | Indian market focus, subscription management |
| **Email** | Resend + React Email | Transactional emails with React components |
| **PWA** | Custom SW + Web Push | Full offline support & push notifications |
| **Styling** | Tailwind CSS v4 | Utility-first, rapid development |

### 1.3 Runtime Matrix

| Layer | Runtime | Deployment |
|-------|---------|------------|
| Middleware | Edge (V8) | Vercel Edge Network |
| API Routes | Node.js (or Edge) | Vercel Serverless |
| Server Components | Node.js (RSC) | Vercel Serverless |
| Static Assets | CDN | Vercel Edge Network |
| Service Worker | Browser | Public directory |
| Push Notifications | Service Worker | Browser |

---

## 2. Multi-Tenant Routing Flow

### 2.1 Tenant Resolution

```
Request: https://acmerealty.estateflow.app/leads
                   │
                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Edge Middleware (Phase 1)                           │
│                                                                              │
│  Host: "acmerealty.estateflow.app"                                          │
│                                                                              │
│  1. Parse subdomain → "acmerealty"                                          │
│  2. Check reserved subdomains (admin, api, www, etc.)                       │
│  3. Verify development mode (localhost)                                      │
│  4. Look up tenant in:                                                      │
│     a. Edge Config (fast path, ~1ms)                                        │
│     b. Supabase DB (slow path, ~50ms, cache result)                         │
│  5. Set headers:                                                            │
│     x-tenant-id: "uuid-of-acmerealty"                                       │
│     x-tenant-slug: "acmerealty"                                             │
│     x-tenant-domain: "acmerealty.estateflow.app"                            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Edge Middleware (Phase 2)                            │
│                                                                              │
│  1. Check if route is public                                                │
│  2. Extract Bearer token from Authorization header                          │
│  3. Verify JWT → extract user_id, role, tenant_id                           │
│  4. Cross-verify tenant_id from JWT matches routing tenant_id               │
│  5. Set headers:                                                            │
│     x-user-id, x-user-role, x-tenant-id, x-session-id                       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Edge Middleware (Phase 3)                            │
│                                                                              │
│  1. Add security headers (CSP, HSTS, X-Frame-Options, etc.)                 │
│  2. Apply rate limiting (Upstash Redis):                                     │
│     - IP-based: 100 req/min for API                                         │
│     - Login: 5 req/15min                                                    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                   │
                   ▼
              Page renders with tenant-specific branding
```

### 2.2 Tenant Resolution Sources (in order)

| Source | Latency | Use Case |
|--------|---------|----------|
| **Edge Config** | ~1ms | Fast path — primary lookup |
| **Upstash Redis** | ~5ms | Cache — fallback if Edge Config misses |
| **Supabase DB** | ~50ms | Source of truth — slow path |
| **Cookie** | ~0ms | Client-side hint for SPA navigation |

### 2.3 URL Patterns

| Pattern | Example | Description |
|---------|---------|-------------|
| Subdomain | `acmerealty.estateflow.app` | Main tenant routing |
| Custom Domain | `app.acmerealty.com` | Tenant's own domain |
| Platform + Slug | `estateflow.app/demo` | Direct access via slug |
| Admin | `estateflow.app/admin` | Platform admin panel |

---

## 3. Database Schema Overview

### 3.1 Core Entities

```
tenants
├── id (uuid, PK)
├── slug (text, UNIQUE)
├── name (text)
├── domain (text, nullable)
├── custom_domain (text, nullable)
├── branding (jsonb) ← White-label config
├── settings (jsonb)
├── is_active (boolean)
└── created_at (timestamptz)

users
├── id (uuid, PK)
├── tenant_id (uuid, FK → tenants)
├── email (text, encrypted)
├── phone (text, encrypted)
├── name (text)
├── role (enum: admin, agent, manager, viewer)
├── password_hash (text)
├── is_active (boolean)
└── created_at (timestamptz)

leads
├── id (uuid, PK)
├── tenant_id (uuid, FK → tenants)
├── name (text)
├── email (text, encrypted)
├── phone (text, encrypted)
├── status (enum: new, contacted, qualified, proposal, negotiation, closed_won, closed_lost)
├── source (enum: website, referral, call, whatsapp, facebook, manual)
├── assigned_to (uuid, FK → users)
├── score (int)
└── created_at (timestamptz)

properties
├── id (uuid, PK)
├── tenant_id (uuid, FK → tenants)
├── title (text)
├── type (enum: apartment, villa, plot, commercial)
├── status (enum: available, sold, rented, under_construction)
├── price (numeric)
├── location (jsonb)
├── amenities (jsonb)
└── created_at (timestamptz)

deals
├── id (uuid, PK)
├── tenant_id (uuid, FK → tenants)
├── lead_id (uuid, FK → leads)
├── property_id (uuid, FK → properties)
├── stage (enum: new, discovery, proposal, negotiation, closing)
├── value (numeric)
├── assigned_to (uuid, FK → users)
└── created_at (timestamptz)

ai_agents
├── id (uuid, PK)
├── tenant_id (uuid, FK → tenants)
├── name (text)
├── provider (enum: bland_ai, retell_ai, vapi)
├── config (jsonb) ← Voice, prompt, scheduling
├── phone_number (text)
└── is_active (boolean)

ai_calls
├── id (uuid, PK)
├── tenant_id (uuid, FK → tenants)
├── agent_id (uuid, FK → ai_agents)
├── lead_id (uuid, FK → leads)
├── status (enum: queued, ringing, in_progress, completed, failed)
├── recording_url (text)
├── transcript (jsonb)
├── analysis (jsonb) ← Sentiment, objections, summary
└── created_at (timestamptz)

subscriptions
├── id (uuid, PK)
├── tenant_id (uuid, FK → tenants)
├── plan (text: starter, growth, enterprise)
├── status (text: active, past_due, canceled, trialing)
├── razorpay_subscription_id (text)
├── current_period_start (timestamptz)
├── current_period_end (timestamptz)
└── created_at (timestamptz)
```

### 3.2 Key Indexes

```sql
-- Tenant-aware lookups (critical for multi-tenant)
CREATE INDEX idx_leads_tenant_id ON leads(tenant_id);
CREATE INDEX idx_properties_tenant_id ON properties(tenant_id);
CREATE INDEX idx_deals_tenant_id ON deals(tenant_id);
CREATE INDEX idx_users_tenant_id ON users(tenant_id);
CREATE INDEX idx_ai_agents_tenant_id ON ai_agents(tenant_id);
CREATE INDEX idx_ai_calls_tenant_id ON ai_calls(tenant_id);

-- Tenant subdomain lookup
CREATE UNIQUE INDEX idx_tenants_slug ON tenants(slug);
CREATE INDEX idx_tenants_domain ON tenants(domain);
CREATE INDEX idx_tenants_custom_domain ON tenants(custom_domain);

-- Lead search
CREATE INDEX idx_leads_phone ON leads(phone);
CREATE INDEX idx_leads_email ON leads(email);
CREATE INDEX idx_leads_status ON leads(tenant_id, status);
CREATE INDEX idx_leads_assigned_to ON leads(assigned_to);

-- Time-based queries
CREATE INDEX idx_ai_calls_created ON ai_calls(tenant_id, created_at DESC);
CREATE INDEX idx_activities_created ON activities(tenant_id, created_at DESC);
```

### 3.3 Row-Level Security (RLS) Strategy

```sql
-- Every table has tenant isolation via RLS
-- Example: leads table
CREATE POLICY tenant_isolation ON leads
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Users can only see their own tenant's data
-- Admins can see all data in their tenant
-- Super-admins (platform) can see across tenants
```

---

## 4. Security Architecture

### 4.1 Defense in Depth

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Defense in Depth Layers                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Layer 1: Edge Security                                                     │
│  ├── Rate Limiting (Upstash Redis)                                          │
│  ├── Security Headers (CSP, HSTS, XFO, etc.)                               │
│  ├── IP Blocking (geographic/known bad actors)                              │
│  └── DDoS Protection (Vercel Edge Network)                                  │
│                                                                              │
│  Layer 2: Authentication & Authorization                                    │
│  ├── JWT with short expiry (1 hour) + refresh tokens                        │
│  ├── Bearer token authentication (middleware)                               │
│  ├── Role-based access (admin, agent, manager, viewer)                      │
│  └── Session management with CSRF protection                                │
│                                                                              │
│  Layer 3: Data Security (Application Layer)                                 │
│  ├── AES-256-GCM encryption for PII (phone, email)                          │
│  ├── Input sanitization (XSS prevention)                                    │
│  ├── Parameterized queries (SQL injection prevention)                       │
│  └── API response sanitization (strip sensitive fields)                     │
│                                                                              │
│  Layer 4: Database Security                                                 │
│  ├── Row-Level Security (RLS) — tenant isolation                            │
│  ├── Service role key (server-side only, never exposed)                     │
│  ├── Anon key (browser-side, RLS-enforced queries)                          │
│  └── Encrypted columns (pgcrypto for PII)                                   │
│                                                                              │
│  Layer 5: Audit & Monitoring                                                │
│  ├── Audit logging (all CRUD operations)                                    │
│  ├── Sentry error tracking                                                  │
│  ├── Rate limit alerting                                                    │
│  └── Failed authentication monitoring                                       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Encryption Strategy

| Field | Algorithm | Where | Notes |
|-------|-----------|-------|-------|
| Email | AES-256-GCM | Application Layer | Deterministic for search |
| Phone | AES-256-GCM | Application Layer | Supports partial match |
| Passwords | bcrypt | Database | 12 rounds |
| JWT | HMAC-SHA256 | Edge/Auth | Stateless |
| API in Transit | TLS 1.3 | Network | Vercel/Cloudflare |

### 4.3 Rate Limiting Tiers

| Tier | Limit | Window | Routes | Storage |
|------|-------|--------|--------|---------|
| Default API | 100 req | 60s | `/api/*` | Upstash Redis |
| Login | 5 req | 900s | `/api/auth/login` | Upstash Redis |
| AI | 10 req | 60s | `/api/ai/*` | Upstash Redis |
| Webhook | 50 req | 60s | `/api/webhooks/*` | Upstash Redis |

---

## 5. AI Voice Agent Flow

### 5.1 End-to-End Flow

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                            AI Voice Agent Flow                                    │
│                                                                                   │
│  ┌─────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌───────────┐   │
│  │  User    │    │  AI Call │    │  Bland   │    │  LLM     │    │  Lead     │   │
│  │  Schedules│───▶│  Queue   │───▶│  AI      │───▶│  Analysis│───▶│  Updated  │   │
│  │  Call    │    │  (Redis) │    │  (Voice) │    │  (Sent.) │    │  (DB)     │   │
│  └─────────┘    └──────────┘    └──────────┘    └──────────┘    └───────────┘   │
│                                                                                   │
│  Alternative: Inbound Call                                                        │
│                                                                                   │
│  ┌─────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌───────────┐   │
│  │  Lead   │    │  Exotel/ │    │  Bland   │    │  AI      │    │  Lead     │   │
│  │  Calls  │───▶│  Twilio  │───▶│  AI      │───▶│  Agent   │───▶│  Created  │   │
│  │  Number │    │  Webhook │    │  (Voice) │    │  Logic   │    │  (DB)     │   │
│  └─────────┘    └──────────┘    └──────────┘    └──────────┘    └───────────┘   │
│                                                                                   │
└──────────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Call Flow Details

```
1. USER TRIGGERS CALL
   ├── Manual: User clicks "Call Lead" in CRM
   ├── Scheduled: Cron job picks from queue every 5 minutes
   └── Automated: Lead score exceeds threshold

2. PRE-CALL PREPARATION
   ├── Fetch lead info (name, property interest, history)
   ├── Generate call script from template (AI)
   ├── Update lead status → "calling"
   └── Add to Bland AI outbound call queue

3. CALL EXECUTION (Bland AI)
   ├── Dial lead's phone number
   ├── Use tenant-specific voice agent config
   ├── Real-time intent detection
   ├── Dynamic response based on lead's answers
   └── Record call audio

4. POST-CALL ANALYSIS
   ├── Transcribe call (speech-to-text)
   ├── Analyze sentiment (positive/negative/neutral)
   ├── Extract key data points (interest level, budget, objections)
   ├── Score lead (AI-driven)
   └── Generate call summary

5. CRM UPDATE
   ├── Create call log entry
   ├── Update lead score
   ├── Create follow-up task if needed
   ├── Notify assigned agent
   └── Update deal stage if applicable
```

### 5.3 Provider Abstraction

```typescript
// Provider factory pattern — allows swapping AI voice providers
interface AIVoiceProvider {
  makeCall(params: CallParams): Promise<CallResult>;
  getTranscript(callId: string): Promise<Transcript>;
  getAnalysis(callId: string): Promise<CallAnalysis>;
  handleWebhook(payload: unknown): Promise<void>;
}

// Supported providers:
// - Bland AI (default, primary)
// - Retell AI (fallback)
// - Vapi (alternative)
```

---

## 6. White-Label System

### 6.1 Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         White-Label System                                   │
│                                                                              │
│  ┌─────────────────────┐    ┌─────────────────────┐                         │
│  │   Database Store    │    │   Edge Cache (Redis) │                         │
│  │   (Supabase)        │◀──▶│   (Upstash)          │                         │
│  │                     │    │                      │                         │
│  │  tenants.branding   │    │  tenant:branding:slug │                         │
│  └─────────────────────┘    └─────────────────────┘                         │
│           │                          │                                       │
│           ▼                          ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │                     CSS Variable Injection                                │ │
│  │                                                                          │ │
│  │  Root     :root {                                                        │ │
│  │  Element:  --tenant-primary: #1e40af;                                    │ │
│  │            --tenant-secondary: #64748b;                                   │ │
│  │            --tenant-accent: #f59e0b;                                     │ │
│  │            --tenant-logo-url: url(https://cdn.tenant.com/logo.png);      │ │
│  │            --tenant-name: "Acme Realty";                                 │ │
│  │  }                                                                       │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│           │                                                                   │
│           ▼                                                                   │
│  ┌──────────────────────────────┐  ┌──────────────────────────────┐          │
│  │   Dynamic Metadata           │  │   Tenant-specific Favicon     │          │
│  │   - Title template           │  │   - Dynamic <link> tag        │          │
│  │   - Description              │  │   - Branded icon              │          │
│  │   - Open Graph tags          │  │   - Apple touch icon          │          │
│  │   - Twitter cards            │  │                                │          │
│  └──────────────────────────────┘  └──────────────────────────────┘          │
│                                                                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 6.2 Config Structure

```typescript
interface WhiteLabelConfig {
  // Branding Colors
  company_name: string;
  logo_url: string | null;
  favicon_url: string | null;
  primary_color: string;     // e.g., "#1e40af"
  secondary_color: string;   // e.g., "#64748b"
  accent_color: string;      // e.g., "#f59e0b"

  // Metadata
  meta_title_prefix: string;
  meta_description: string;

  // Features (per-tenant feature flags)
  features: {
    ai_agents: boolean;
    chatbot: boolean;
    whatsapp: boolean;
    call_recording: boolean;
    advanced_analytics: boolean;
  };

  // Custom CSS
  custom_css: string | null;
}
```

### 6.3 Rendering Flow

```
1. Page Request
   ├── Edge middleware sets x-tenant-slug header
   └── Server component reads header

2. Config Resolution (useTenant hook)
   ├── Check Redis cache (key: tenant:branding:{slug})
   ├── Cache miss → Fetch from Supabase
   ├── Cache result in Redis (TTL: 300s)
   └── Return WhiteLabelConfig

3. CSS Injection (ClientLayout component)
   ├── Call injectBrandingCSS(config)
   ├── Set CSS variables on document root
   ├── Apply custom CSS if present
   └── Trigger smooth transition (no flash of default branding)

4. Metadata Generation (generateTenantMetadata)
   ├── Set page title: "{company_name} | EstateFlow"
   ├── Set OG tags with tenant branding
   ├── Set favicon to tenant-specific icon
   └── Inject tenant-specific theme color
```

---

## 7. Performance Optimization Strategies

### 7.1 Caching Strategy

| Layer | Cache | TTL | Invalidation |
|-------|-------|-----|-------------|
| Edge (CDN) | Static assets (JS, CSS, images) | 1 year | Deploy new build |
| Edge (CDN) | Pages (ISR) | 60s | On-demand revalidation |
| Edge Config | Tenant routing | ~1 hour | Admin action triggers update |
| Redis | Tenant branding | 5 min | Config change |
| Redis | API responses | 30-60s | Mutating request |
| Browser | Service Worker (static) | Until next SW version | Update SW |
| Browser | Service Worker (API) | On-demand | Network-first strategy |

### 7.2 Rendering Strategy

| Route Pattern | Rendering | Rationale |
|---------------|-----------|-----------|
| `/[tenant]/dashboard` | SSR (dynamic) | Personalized per user |
| `/[tenant]/leads` | SSR (dynamic) | Always fresh data |
| `/[tenant]/properties/[id]` | ISR (60s) | Public, rarely changes |
| `/api/*` | Edge/Node API | Fresh data always |
| Public pages | ISR (300s) | SEO-friendly |
| Static assets | Static file | Never changes |

### 7.3 Load Time Optimizations

```typescript
// 1. React Server Components (RSC) — zero client JS for data fetching
// 2. Streaming SSR — send HTML progressively
// 3. Route prefetching — instant navigation
// 4. Image optimization — next/image with WebP
// 5. Font optimization — next/font with Google Fonts subsetting
// 6. Bundle splitting — dynamic imports for heavy components
// 7. Code splitting — per-route chunks
// 8. Tree shaking — unused exports excluded
```

### 7.4 Database Optimizations

- **Connection pooling**: Supabase pooler (port 6543) for serverless
- **Indexes**: All foreign keys and filter columns indexed
- **Query optimization**: N+1 query prevention with Prisma-style loaders
- **Materialized views**: For dashboard aggregates (refresh every 5 min)
- **Read replicas**: Supabase read replicas for reporting queries

### 7.5 Edge Optimizations

- **Middleware**: Runs at edge, minimal computation (routing + auth + security)
- **Edge Config**: ~1ms reads for tenant routing
- **Upstash Redis**: Global replication for rate limiting
- **Vercel Edge Network**: 100+ locations worldwide

---

## 8. File Structure Map

```
estateflow-crm/
│
├── .env.example                # All environment variables documented
├── .github/
│   └── workflows/
│       └── deploy.yml          # CI/CD pipeline
│
├── DEPLOYMENT.md               # Complete deployment guide
├── ARCHITECTURE.md             # This document
│
├── public/
│   ├── sw.js                   # Service worker (caching + push notifications)
│   ├── manifest.json           # PWA manifest
│   ├── offline.html            # Offline fallback page
│   ├── favicon.ico             # Default favicon
│   ├── images/                 # Icons and images
│   │   ├── icon-192.png        # PWA icon (192x192)
│   │   ├── icon-512.png        # PWA icon (512x512)
│   │   └── apple-touch-icon.png# Apple touch icon (180x180)
│   └── fonts/                  # Custom fonts
│
├── src/
│   ├── middleware.ts           # Edge middleware (routing + auth + security)
│   │
│   ├── app/
│   │   ├── layout.tsx          # Root layout (PWA metadata + SW registration)
│   │   ├── page.tsx            # Landing page
│   │   ├── globals.css         # Global styles + Tailwind v4
│   │   │
│   │   ├── [tenant]/           # Tenant-scoped routes
│   │   │   ├── dashboard/
│   │   │   ├── leads/
│   │   │   │   ├── page.tsx
│   │   │   │   └── [id]/
│   │   │   ├── properties/
│   │   │   │   ├── page.tsx
│   │   │   │   ├── [id]/
│   │   │   │   └── new/
│   │   │   ├── deals/
│   │   │   │   ├── page.tsx
│   │   │   │   └── [id]/
│   │   │   ├── ai/
│   │   │   │   ├── agents/
│   │   │   │   │   ├── page.tsx
│   │   │   │   │   └── [id]/
│   │   │   │   ├── calls/
│   │   │   │   │   ├── page.tsx
│   │   │   │   │   └── [id]/
│   │   │   │   └── analytics/
│   │   │   ├── communication/
│   │   │   │   ├── calls/
│   │   │   │   ├── messages/
│   │   │   │   └── templates/
│   │   │   ├── chatbot/
│   │   │   │   └── settings/
│   │   │   ├── documents/
│   │   │   ├── calendar/
│   │   │   ├── tasks/
│   │   │   ├── expenses/
│   │   │   ├── attendance/
│   │   │   ├── activity/
│   │   │   └── settings/
│   │   │       ├── billing/
│   │   │       └── notifications/
│   │   │
│   │   ├── admin/              # Platform admin routes
│   │   │   └── billing/
│   │   │
│   │   └── api/                # API routes
│   │       ├── auth/
│   │       │   ├── login/
│   │       │   └── register/
│   │       ├── leads/
│   │       │   ├── route.ts
│   │       │   ├── [id]/
│   │       │   ├── search/
│   │       │   ├── stats/
│   │       │   ├── bulk/
│   │       │   └── duplicates/
│   │       ├── properties/
│   │       ├── deals/
│   │       ├── tasks/
│   │       ├── expenses/
│   │       ├── calendar/
│   │       ├── documents/
│   │       ├── attendance/
│   │       ├── commissions/
│   │       ├── communications/...
│   │       ├── ai/
│   │       │   ├── agents/
│   │       │   ├── calls/
│   │       │   └── analytics/
│   │       ├── chatbot/
│   │       ├── forms/
│   │       ├── payments/
│   │       │   ├── create-subscription/
│   │       │   ├── cancel-subscription/
│   │       │   ├── billing/
│   │       │   ├── invoices/
│   │       │   └── setup-fee/
│   │       ├── notifications/
│   │       │   ├── subscribe/
│   │       │   ├── preferences/
│   │       │   └── vapid-public-key/
│   │       ├── dashboard/
│   │       ├── webhooks/
│   │       │   ├── razorpay/
│   │       │   ├── voice/
│   │       │   ├── ai-call/
│   │       │   ├── whatsapp/
│   │       │   ├── leads/
│   │       │   ├── google/
│   │       │   └── facebook/
│   │       ├── cron/
│   │       │   └── ai-call-queue/
│   │       └── tenants/
│   │           └── [slug]/
│   │               └── branding/
│   │
│   ├── components/
│   │   ├── ui/                 # shadcn/ui components
│   │   ├── layout/             # Layout components
│   │   │   ├── ClientLayout.tsx
│   │   │   ├── TenantLogo.tsx
│   │   │   └── TenantFavicon.tsx
│   │   ├── pwa/                # PWA components
│   │   ├── dashboard/
│   │   ├── leads/
│   │   ├── properties/
│   │   ├── ai/
│   │   ├── chatbot/
│   │   ├── communication/
│   │   ├── activity/
│   │   └── forms/
│   │
│   ├── lib/
│   │   ├── database/           # Supabase client & queries
│   │   ├── auth/               # JWT, permissions, roles
│   │   │   ├── index.ts
│   │   │   ├── jwt.ts
│   │   │   ├── permissions.ts
│   │   │   └── roles.ts
│   │   ├── routing/            # Multi-tenant routing
│   │   │   ├── index.ts
│   │   │   ├── subdomainParser.ts
│   │   │   ├── tenantResolver.ts
│   │   │   └── edgeConfigCache.ts
│   │   ├── security/           # Encryption, rate limiting, audit
│   │   │   ├── index.ts
│   │   │   ├── encryption.ts
│   │   │   ├── rateLimiter.ts
│   │   │   ├── auditLogger.ts
│   │   │   ├── securityHeaders.ts
│   │   │   └── sanitize.ts
│   │   ├── whitelabel/         # White-label system
│   │   │   ├── index.ts
│   │   │   ├── config.ts
│   │   │   ├── useTenant.ts
│   │   │   └── metadata.ts
│   │   ├── ai/                 # AI voice agents
│   │   │   ├── index.ts
│   │   │   ├── orchestrator.ts
│   │   │   ├── providerFactory.ts
│   │   │   ├── agentConfig.ts
│   │   │   ├── callQueue.ts
│   │   │   ├── callAnalytics.ts
│   │   │   ├── transcriptAnalysis.ts
│   │   │   ├── scriptBuilder.ts
│   │   │   ├── scriptTemplates.ts
│   │   │   ├── leadScoreUpdater.ts
│   │   │   └── providers/
│   │   │       ├── blandAI.ts
│   │   │       ├── retellAI.ts
│   │   │       └── vapi.ts
│   │   ├── communication/      # SMS, WhatsApp, Email, Voice
│   │   │   ├── messageService.ts
│   │   │   ├── notificationService.ts
│   │   │   ├── providerFactory.ts
│   │   │   ├── templates.ts
│   │   │   ├── aiEnhancement.ts
│   │   │   ├── propertyShare.ts
│   │   │   ├── dryRun.ts
│   │   │   └── providers/
│   │   │       ├── exotel.ts
│   │   │       ├── twilio.ts
│   │   │       ├── wati.ts
│   │   │       ├── msg91.ts
│   │   │       └── resend.ts
│   │   ├── notification/       # Push notifications
│   │   │   ├── index.ts
│   │   │   ├── pwaPush.ts
│   │   │   └── preferences.ts
│   │   ├── chatbot/            # AI chatbot
│   │   ├── payments/           # Razorpay integration
│   │   ├── leads/              # Lead management
│   │   ├── properties/
│   │   ├── deals/
│   │   ├── tasks/
│   │   ├── expenses/
│   │   ├── calendar/
│   │   ├── documents/
│   │   ├── attendance/
│   │   ├── commissions/
│   │   ├── email/
│   │   ├── forms/
│   │   ├── dashboard/
│   │   ├── activity/
│   │   ├── cache/
│   │   ├── utils.ts
│   │   └── constants.ts
│   │
│   ├── hooks/                  # Custom React hooks
│   ├── types/                  # TypeScript type definitions
│   └── styles/                 # Additional styles
│
├── next.config.js             # Next.js config with PWA headers
├── package.json
├── tsconfig.json
├── tailwind.config.ts
└── postcss.config.mjs
```

---

## Appendix A: Data Flow Patterns

### A.1 Read Flow (e.g., Dashboard)

```
Browser ──▶ Next.js (RSC) ──▶ Service Layer ──▶ Database/Cache ──▶ HTML/JSON
   │               │               │                    │               │
   │    Request    │               │                    │               │
   ├──────────────►│               │                    │               │
   │               │   Fetch Data  │                    │               │
   │               ├──────────────►│                    │               │
   │               │               │  Query Cache/DB    │               │
   │               │               ├───────────────────►│               │
   │               │               │◄───────────────────┤               │
   │               │◄──────────────┤                    │               │
   │               │  Stream RSC   │                    │               │
   │◄──────────────┤               │                    │               │
   │  Render       │               │                    │               │
```

### A.2 Write Flow (e.g., Create Lead)

```
Browser ──▶ API Route ──▶ Validation ──▶ Service ──▶ Database ──▶ Cache Invalidation
   │           │              │             │            │              │
   │  POST     │              │             │            │              │
   ├──────────►│              │             │            │              │
   │           │  Validate    │             │            │              │
   │           ├─────────────►│             │            │              │
   │           │◄─────────────┤             │            │              │
   │           │  Create      │             │            │              │
   │           ├──────────────┼────────────►│            │              │
   │           │              │             │  INSERT    │              │
   │           │              │             ├───────────►│              │
   │           │              │             │            │  Invalidate  │
   │           │              │             │            ├─────────────►│
   │           │◄─────────────┼────────────┤            │              │
   │◄──────────┤              │             │            │              │
   │  201      │              │             │            │              │
```

---

## Appendix B: Error Handling Strategy

| Error Type | Handling | Response |
|------------|----------|----------|
| Validation | Zod schema validation | 400 + field errors |
| Auth | JWT verification failure | 401 |
| Permissions | Role check failure | 403 |
| Rate Limit | Upstash Redis check | 429 + Retry-After |
| Not Found | DB query returns null | 404 |
| Server Error | Try/catch + Sentry | 500 + error ID |
| Offline | Service Worker fallback | 503 + offline page |

---

> **Document Status:** Living document — update as the architecture evolves.
> **Maintainers:** @estateflow-eng
