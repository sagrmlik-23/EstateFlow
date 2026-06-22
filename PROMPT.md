# ESTATEFLOW CRM — Production-Ready Prompt
# White-Label Multi-Tenant SaaS with AI Voice Agents

## CRITICAL REQUIREMENTS (Non-Negotiable)
1. SCALABILITY: 10,000+ tenants
2. LOW LATENCY: API <100ms, Page <1.5s, AI call <3s
3. SECURITY: Zero data leakage, encryption, audit logs
4. AI VOICE AGENTS: SaaS owner (many) + Client (1-2 each)
5. PRICING: One-time setup + monthly, per-client negotiation
6. WHITE-LABEL: Domain, logo, colors, email, voice per tenant
7. INDIA-FIRST: MSG91, Exotel, Bland AI/Retell AI, Razorpay
8. PWA: Installable, offline, push
9. ZERO BUGS: TypeScript strict, comprehensive validation

## Architecture
- Next.js 15 App Router on Vercel Edge (bom1)
- Supabase PostgreSQL with RLS + 64 hash partitions
- Redis/Edge Config caching (multi-layer)
- Adapter pattern for all external services

## Phases
P1: Foundation — DB schema, RLS, routing, auth, white-label, security
P2: Core CRM — leads, properties, APIs, dashboard
P3: AI Voice Agent — Bland AI/Retell AI, orchestrator, analytics
P4: Communication — Exotel, WATI, MSG91, Resend
P5: AI Chatbot — website + WhatsApp chatbot
P6: Modules — attendance, calendar, docs, deals, expenses
P7: Payments — Razorpay, subscriptions, invoices, GST
P8: Polish — PWA, perf tuning, security audit, load testing

## Acceptance Criteria (All Must Pass)
- [ ] RLS on ALL tables — automated tests
- [ ] Cross-tenant access returns zero rows
- [ ] API <100ms (p95) cached
- [ ] AI call setup <3s
- [ ] One-time + monthly pricing works
- [ ] Per-client negotiation supported
- [ ] White-label for every tenant independently
- [ ] 10K tenants without connection exhaustion

## Critical Reminders
1. EVERY table MUST have tenant_id
2. EVERY query MUST filter by tenant_id (RLS)
3. EVERY API MUST validate tenant access
4. EVERY upload MUST be tenant-scoped
5. EVERY external service MUST use tenant-specific config
6. Dry-run mode for ALL integrations
7. White-label MUST work independently per tenant
8. Mobile-first design
9. Unlimited users per tenant
10. AI Voice Agent is CORE feature
11. One-time + monthly pricing
12. Per-client negotiation supported
