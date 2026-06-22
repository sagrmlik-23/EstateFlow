# EstateFlow CRM — Deployment Guide

> **Version:** 1.0.0  
> **Last Updated:** June 2026  
> **Stack:** Next.js 15 + Supabase + Redis (Upstash) + Vercel Edge Config

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Environment Variables Setup](#2-environment-variables-setup)
3. [Supabase Project Setup](#3-supabase-project-setup)
4. [Redis / Upstash Setup](#4-redis--upstash-setup)
5. [Vercel Edge Config Setup](#5-vercel-edge-config-setup)
6. [External Services Setup](#6-external-services-setup)
7. [Vercel Deployment](#7-vercel-deployment)
8. [Custom Domain Setup for Tenants](#8-custom-domain-setup-for-tenants)
9. [CI/CD Pipeline Setup](#9-cicd-pipeline-setup)
10. [Monitoring with Sentry](#10-monitoring-with-sentry)
11. [Post-Deployment Checklist](#11-post-deployment-checklist)

---

## 1. Prerequisites

### Required Accounts

| Service | Purpose | Tier |
|---------|---------|------|
| [Vercel](https://vercel.com) | Hosting | Pro (for team features & edge config) |
| [Supabase](https://supabase.com) | Database + Auth | Pro ($25/mo) |
| [Upstash](https://upstash.com) | Redis + Rate Limiting | Pro ($10/mo) |
| [Sentry](https://sentry.io) | Error Monitoring | Team ($29/mo) |
| [Razorpay](https://razorpay.com) | Payments (India) | Standard |
| [Resend](https://resend.com) | Transactional Email | Growth ($20/mo) |
| [Bland AI](https://bland.ai) | Voice AI Agents | Pay-as-you-go |

### Required CLI Tools

```bash
# Vercel CLI
npm install -g vercel

# Supabase CLI
npm install -g supabase

# Node.js >= 18
node --version  # Should be >= 18

# Git
git --version
```

---

## 2. Environment Variables Setup

### 2.1 Copy Example File

```bash
cp .env.example .env.local
```

### 2.2 Variable Reference

#### Database & Auth

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | Supabase PostgreSQL connection string | ✅ |
| `SUPABASE_URL` | Supabase project URL | ✅ |
| `SUPABASE_ANON_KEY` | Supabase anonymous key (public) | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (secret) | ✅ |
| `SUPABASE_JWT_SECRET` | JWT secret for Supabase auth | ✅ |
| `JWT_SECRET` | App-level JWT signing secret | ✅ |

#### Encryption

| Variable | Description | Required |
|----------|-------------|----------|
| `ENCRYPTION_KEY` | AES-256-GCM key (64 hex chars) | ✅ |
| `APP_ENCRYPTION_KEY` | Same as above (alias) | ✅ |

#### Redis & Edge Config

| Variable | Description | Required |
|----------|-------------|----------|
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST URL | ✅ |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis REST token | ✅ |
| `EDGE_CONFIG` | Vercel Edge Config ID | ✅ |
| `EDGE_CONFIG_ITEM_KEY` | Key for tenant routing cache | ✅ |

#### AI Providers

| Variable | Description | Required |
|----------|-------------|----------|
| `BLAND_AI_KEY` | Bland AI API key for voice agents | ✅ |
| `RETELL_AI_KEY` | Retell AI API key (alternative) | Optional |
| `VAPI_API_KEY` | Vapi API key (alternative) | Optional |
| `OPENROUTER_API_KEY` | OpenRouter API key for LLM | Optional |
| `GROQ_API_KEY` | Groq API key for fast inference | Optional |

#### Communication

| Variable | Description | Required |
|----------|-------------|----------|
| `EXOTEL_SID` | Exotel account SID | Optional |
| `EXOTEL_TOKEN` | Exotel API token | Optional |
| `TWILIO_ACCOUNT_SID` | Twilio account SID | Optional |
| `TWILIO_AUTH_TOKEN` | Twilio auth token | Optional |
| `WATI_API_KEY` | WATI WhatsApp API key | Optional |
| `MSG91_API_KEY` | MSG91 API key | Optional |
| `RESEND_API_KEY` | Resend API key for email | ✅ |

#### Payments

| Variable | Description | Required |
|----------|-------------|----------|
| `RAZORPAY_KEY_ID` | Razorpay live key ID | ✅ |
| `RAZORPAY_KEY_SECRET` | Razorpay secret key | ✅ |
| `RAZORPAY_WEBHOOK_SECRET` | Webhook signing secret | ✅ |

#### Monitoring

| Variable | Description | Required |
|----------|-------------|----------|
| `SENTRY_DSN` | Sentry private DSN | ✅ |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry public DSN | ✅ |
| `SENTRY_ORG` | Sentry organization slug | ✅ |
| `SENTRY_PROJECT` | Sentry project name | ✅ |

#### PWA / Push Notifications

| Variable | Description | Required |
|----------|-------------|----------|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | VAPID public key for Web Push | ✅ |
| `VAPID_PRIVATE_KEY` | VAPID private key | ✅ |
| `VAPID_SUBJECT` | mailto: for push notification identity | ✅ |

#### Cron & Feature Flags

| Variable | Description | Required |
|----------|-------------|----------|
| `CRON_SECRET` | Secret for securing cron endpoints | ✅ |
| `PLATFORM_DOMAIN` | Main platform domain (e.g., estateflow.app) | ✅ |

### 2.3 Generate VAPID Keys

```bash
npx web-push generate-vapid-keys

# Output:
# Public Key:
# BNk...
# Private Key:
# ...
```

---

## 3. Supabase Project Setup

### 3.1 Create Supabase Project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard)
2. Click **New project**
3. Choose a **strong database password** (save it for `DATABASE_URL`)
4. Select region closest to your users
5. Wait for database provisioning (~2 minutes)

### 3.2 Run Database Migrations

```bash
# Apply all migrations
supabase db push

# Or run the schema SQL directly via Supabase SQL Editor
# Copy contents of: supabase/migrations/*.sql
```

### 3.3 Configure Auth Settings

1. Go to **Authentication → Settings**
2. Enable **JWT expiry**: 3600 seconds (1 hour)
3. Set **JWT refresh token expiry**: 43200 (30 days)
4. Configure **Site URL**: `https://estateflow.app`
5. Add **Redirect URLs**:
   - `https://estateflow.app/**`
   - `https://*.estateflow.app/**`
   - `http://localhost:3000/**`

### 3.4 Set Up Row-Level Security

```sql
-- Enable RLS on all tables
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
-- ... etc for all tables

-- Verify policies exist
SELECT * FROM pg_policies;
```

### 3.5 Create Service Role API Keys

1. Go to **Project Settings → API**
2. Copy `Project URL` → `SUPABASE_URL`
3. Copy `anon public` → `SUPABASE_ANON_KEY`
4. Copy `service_role` → `SUPABASE_SERVICE_ROLE_KEY`
5. Copy `JWT Secret` → `SUPABASE_JWT_SECRET`

---

## 4. Redis / Upstash Setup

### 4.1 Create Upstash Redis Database

1. Go to [upstash.com](https://upstash.com)
2. Create a new Redis database
3. Choose **Global** for edge distribution (or a specific region)
4. Select **TLS** enabled

### 4.2 Configure Upstash

```bash
# Copy the REST URL and token
UPSTASH_REDIS_REST_URL=https://xxxxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token
```

### 4.3 Verify Connection

```typescript
// Test script
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

await redis.set('test', 'ok');
const value = await redis.get('test');
console.log('Redis connected:', value === 'ok'); // Should be true
```

---

## 5. Vercel Edge Config Setup

### 5.1 Create Edge Config

```bash
# Via Vercel CLI
vercel edge-config add estateflow-tenant-routing

# Copy the Edge Config ID → EDGE_CONFIG
# The store key (default: 'tenant-routing') → EDGE_CONFIG_ITEM_KEY
```

### 5.2 Seed Tenant Routing Data

```typescript
import { createClient } from '@vercel/edge-config';

const edgeConfig = createClient(process.env.EDGE_CONFIG!);

// Add tenant routing
await edgeConfig.set('tenant-routing', {
  'tenant1': { slug: 'tenant1', tenantId: 'uuid-1', domain: 'tenant1.estateflow.app' },
  'tenant2': { slug: 'tenant2', tenantId: 'uuid-2', domain: 'custom.com' },
  // ... all tenants
});
```

---

## 6. External Services Setup

### 6.1 Razorpay (Payments)

1. Create account at [razorpay.com](https://razorpay.com)
2. Go to **Settings → API Keys**
3. Generate **Key ID** and **Key Secret**
4. Set up **Webhooks** → Add endpoint: `https://estateflow.app/api/webhooks/razorpay`
5. Copy the **Webhook Secret**

### 6.2 Bland AI (Voice Agents)

1. Sign up at [bland.ai](https://bland.ai)
2. Go to **Settings → API**
3. Generate API key
4. Configure webhook URL: `https://estateflow.app/api/webhooks/voice`

### 6.3 Exotel (Voice & SMS)

1. Create account at [exotel.com](https://exotel.com)
2. Get SID and API token from **Settings → API Keys**
3. Configure webhook URL: `https://estateflow.app/api/webhooks/voice`

### 6.4 WATI (WhatsApp Business)

1. Sign up at [wati.io](https://wati.io)
2. Get API key from **Settings → API**
3. Configure webhook URL: `https://estateflow.app/api/webhooks/whatsapp`

### 6.5 MSG91 (SMS/WhatsApp India)

1. Create account at [msg91.com](https://msg91.com)
2. Get API key from **Settings → API Keys**

### 6.6 Resend (Email)

1. Sign up at [resend.com](https://resend.com)
2. Go to **API Keys** → Create API key
3. Verify your domain in **Domains**

---

## 7. Vercel Deployment

### 7.1 Initial Setup

```bash
# Login to Vercel
vercel login

# Link your project
vercel link

# Set up environment (production)
vercel env add SUPABASE_URL production
vercel env add SUPABASE_ANON_KEY production
# ... add all env vars
```

### 7.2 Deploy

```bash
# Preview deployment
vercel

# Production deployment
vercel --prod
```

### 7.3 Vercel Project Settings

**Build & Development Settings:**
- **Framework Preset:** Next.js
- **Build Command:** `next build`
- **Output Directory:** `.next`
- **Node.js Version:** 22.x

**Environment Variables:** Add all variables from `.env.example` as **Production** scope.

**Edge Functions:**
- Edge Config must be linked in **Project → Edge Config** tab.

### 7.4 Post-Deployment Verification

```bash
# Check deployment status
vercel inspect --scope estateflow

# View logs
vercel logs --prod
```

---

## 8. Custom Domain Setup for Tenants

### 8.1 Platform Domain

1. Go to **Vercel → Project → Domains**
2. Add `estateflow.app` (or your main domain)
3. Configure DNS records as instructed

### 8.2 Wildcard Domain

For tenant subdomains (`tenant1.estateflow.app`, etc.):

1. Add `*.estateflow.app` as a domain in Vercel
2. Add a wildcard CNAME record:
   ```
   *.estateflow.app  CNAME  cname.vercel-dns.com
   ```

### 8.3 Custom Tenant Domains

For tenants who want their own domain:

1. Tenant adds a CNAME record pointing to `cname.vercel-dns.com`
2. Admin adds the domain via the admin panel
3. Vercel automatically provisions SSL

### 8.4 Edge Config Updates

When a custom domain is added:

```typescript
// Automatically update Edge Config
await edgeConfig.set('tenant-routing', {
  ...existing,
  [tenant.slug]: {
    slug: tenant.slug,
    tenantId: tenant.id,
    domain: tenant.customDomain,
  },
});
```

---

## 9. CI/CD Pipeline Setup

### 9.1 GitHub Actions

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Vercel

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run build

  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          vercel-args: '--prod'
```

### 9.2 Vercel Token Setup

```bash
# Create a Vercel token
vercel tokens create

# Add to GitHub secrets
gh secret set VERCEL_TOKEN -b "your-token"
gh secret set VERCEL_ORG_ID -b "your-org-id"
gh secret set VERCEL_PROJECT_ID -b "your-project-id"
```

### 9.3 Preview Deployments

Each PR gets an automatic preview deployment with a unique URL. Environment variables for preview:

```bash
vercel env add NEXT_PUBLIC_APP_URL preview
# Set to: https://estateflow-git-branch-slug.vercel.app
```

---

## 10. Monitoring with Sentry

### 10.1 Setup

1. Create a project at [sentry.io](https://sentry.io)
2. Choose **Next.js** platform
3. Copy the DSN

### 10.2 Environment Variables

```bash
SENTRY_DSN=https://xxxxx@sentry.io/xxxxx
NEXT_PUBLIC_SENTRY_DSN=https://xxxxx@sentry.io/xxxxx
SENTRY_ORG=estateflow
SENTRY_PROJECT=estateflow-crm
```

### 10.3 Source Maps Upload

Configure in `next.config.js` (already done via Sentry webpack plugin if using `@sentry/nextjs`).

### 10.4 Performance Monitoring

```typescript
// Configure sample rates in sentry.config.ts
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.2, // 20% of transactions
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
});
```

### 10.5 Alert Rules

Configure in Sentry:
- **Error Alerts:** Notify on any new issue
- **Performance Alerts:** P95 response time > 2s
- **Crash-Free Rate:** < 99% crash-free session rate

---

## 11. Post-Deployment Checklist

### 11.1 Verify Critical Flows

- [ ] User registration & login works
- [ ] Tenant routing resolves correctly (subdomain & custom domain)
- [ ] Dashboard loads with real data
- [ ] CRUD operations on leads, properties, deals work
- [ ] AI voice agents can make/receive calls
- [ ] Chatbot widget renders on public pages
- [ ] Email notifications are delivered
- [ ] SMS/WhatsApp messages are sent
- [ ] Payment subscriptions work end-to-end
- [ ] Webhook endpoints process events correctly
- [ ] Cron jobs execute on schedule

### 11.2 Verify PWA

- [ ] `manifest.json` serves with correct MIME type
- [ ] Service worker registers successfully
- [ ] App installs as PWA on supported browsers
- [ ] Push notifications display correctly
- [ ] Offline fallback page shows when offline
- [ ] Icons display correctly on all platforms

### 11.3 Security Checks

- [ ] RLS policies are active on all tables
- [ ] Rate limiting is functioning (test with 429 response)
- [ ] Security headers are present (CSP, HSTS, X-Frame-Options)
- [ ] PII fields are encrypted at rest
- [ ] JWT tokens expire appropriately
- [ ] Webhook signatures are verified

### 11.4 Performance Checks

- [ ] Lighthouse score > 90 for Performance
- [ ] Lighthouse score > 90 for Accessibility
- [ ] Lighthouse score > 90 for Best Practices
- [ ] Lighthouse score > 90 for SEO
- [ ] PWA Lighthouse audit passes
- [ ] First Contentful Paint < 1.5s
- [ ] Largest Contentful Paint < 2.5s
- [ ] First Input Delay < 100ms

### 11.5 Monitoring

- [ ] Sentry errors are being captured
- [ ] Performance traces are visible
- [ ] Logs are streaming to Vercel dashboard
- [ ] Rate limit alerts are configured
- [ ] Database connection pool is adequate

---

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| `EDGE_CONFIG` not found | Ensure Edge Config is linked in Vercel project |
| Rate limit errors | Check Upstash Redis is reachable |
| PWA not installing | Verify HTTPS, valid manifest, and SW registration |
| Webhook failures | Check endpoint URLs and signing secrets |
| Supabase auth errors | Verify JWT secret matches between Supabase and env vars |
| Tenant routing not working | Check Edge Config data and wildcard DNS |

### Rollback

```bash
# Rollback to previous deployment
vercel rollback --prod <deployment-id>

# Or via Vercel dashboard → Deployments → ... → Rollback
```

---

> **Need help?** Contact support@estateflow.app or open an issue in the repository.
