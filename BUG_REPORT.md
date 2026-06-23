# 🔴 ESTATEFLOW CRM — COMPLETE BUG REPORT
> Generated: 2026-06-23 | 6 Parallel Agents | Full Codebase Scan
> tsc --strict: 0 errors | next build: PASS | BUT: 100+ runtime/logic/security bugs found

---

## 📊 SUMMARY

| Severity | Count | Impact |
|----------|-------|--------|
| 🔴 CRITICAL | 16 | Multi-tenant isolation DEFEATED, Login BROKEN, RLS BYPASSED, Data LOST |
| 🟠 HIGH | 33 | Auth gaps, missing DB writes, config broken, security headers missing |
| 🟡 MEDIUM | 35 | Inconsistent patterns, missing error handling, accessibility |
| 🟢 LOW | 20+ | Code quality, dead code, minor issues |
| **TOTAL** | **~100+** | |

---

## 🔴 TOP 16 CRITICAL BUGS

### 1. TENANT ISOLATION COMPLETELY BYPASSED (middleware.ts:254)
**Root cause:** Phase 1 sets `x-tenant-id` on **response**, Phase 2 reads `x-tenant-id` from **request**.
Result: `routingTenantId` always `null` → tenant-vs-JWT check NEVER runs.
**Impact:** Any user with valid JWT from tenant A can access tenant B. Complete multi-tenant isolation defeat.

### 2. LOGIN ALWAYS FAILS (auth/login/route.ts:105-126)
**Root cause:** `findUserByEmail()` is a hard stub that always returns `null`.
**Impact:** No user can EVER log in. Zero auth works.

### 3. REGISTRATION NEVER PERSISTS (auth/register/route.ts:179-206)
**Root cause:** All 4 DB helpers (`findTenantBySlug`, `findUserByEmail`, `createTenant`, `createUser`) are stubs.
**Impact:** Registration returns 201 but nothing goes to database. JWT generated for non-existent user.

### 4. SERVICE ROLE KEY USED EVERYWHERE → RLS BYPASSED GLOBALLY (21 files)
**Root cause:** `process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY` — service key always takes priority.
**Impact:** All Row-Level Security policies are BYPASSED across ALL queries in 21 files.

### 5. RLS SESSION VARIABLES NEVER SET (withTenantContext.ts:29-39)
**Root cause:** `executeSQL()` only logs in dev mode. Never sends SQL to PostgreSQL.
**Impact:** `app.current_tenant`, `app.current_user_id`, `app.current_role` never set → RLS policies dependent on these are dead.

### 6. NO AUTH CONTEXT IN SUPABASE CLIENTS (ALL query files)
**Root cause:** Every supabase client created WITHOUT `Authorization` header or `accessToken`.
**Impact:** Even if service key bug is fixed, `auth.uid()` is always null → all queries fail or return all data.

### 7. CROSS-TENANT DATA LEAK IN SINGLE-ENTITY LOOKUPS (10 functions)
**Root cause:** `getLeadById()`, `getDealById()`, `getTaskById()`, etc. filter by `.eq('id', id)` only — no `tenant_id` filter.
**Impact:** Any user can read ANY tenant's records by guessing UUIDs.

### 8. TAILWIND v4 PACKAGE WITH v3 CONFIG → STYLES BROKEN
**Root cause:** `tailwindcss@^4.0.0` installed but config is v3 format. v4 uses CSS-first, not `tailwind.config.ts`.
**Impact:** Tailwind classes will NOT generate. Entire app has no styles in production.

### 9. MISSING `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` (.env.example)
**Root cause:** Client-side Supabase needs `NEXT_PUBLIC_` prefix. Only server-side vars present.
**Impact:** Client components cannot connect to Supabase. Entire frontend auth/data dead.

### 10. MISSING `darkMode: 'class'` IN TAILWIND CONFIG
**Root cause:** `next-themes` requires `darkMode: 'class'` but config doesn't have it.
**Impact:** Dark mode toggle broken. `dark:` variants never activate.

### 11. CHATBOT LEADS SILENTLY LOST (chatbot/leadCapture.ts:283-336)
**Root cause:** `supabase.from('leads').upsert(...)` is COMMENTED OUT.
**Impact:** Every lead captured via chatbot is silently discarded.

### 12. WEBHOOK LEADS SILENTLY LOST (leads/intakeWebhook.ts:364-416)
**Root cause:** `supabase.from('leads').insert(...)` is COMMENTED OUT.
**Impact:** All Facebook/Google/webhook leads silently lost.

### 13. SMART ASSIGNMENT NEVER PERSISTS (leads/smartAssignment.ts:68,276-281)
**Root cause:** Uses in-memory array, DB update is commented out.
**Impact:** Agent assignments lost on restart. No persistence.

### 14. INTERNAL TENANT RESOLVER API DOESN'T EXIST (routing/tenantResolver.ts:127-132)
**Root cause:** Calls `GET /api/internal/resolve-tenant` but `src/app/api/internal/` directory NEVER CREATED.
**Impact:** Tenant resolution by slug/domain fails for ALL non-dev tenants. Falls back to demo.

### 15. SEED DATA — ALL USERS HAVE IDENTICAL FAKE BCRYPT HASH
**Root cause:** All 5 seed users have same placeholder hash (not valid bcrypt).
**Impact:** Seed accounts are UNUSABLE for login. Dev testing impossible.

### 16. NO `form_submissions` TABLE
**Root cause:** `forms` table has `submission_count` but no table to store actual submissions.
**Impact:** Form submissions completely lost. Count exists but data doesn't.

---

## 🟠 TOP HIGH-SEVERITY BUGS

### Auth & Security
- **PUBLIC_ROUTES prefix bypass** (middleware.ts:45-51): `/api/tenants` matches `/api/tenants/settings`, `/api/tenants/users` — exposes tenant internals without auth
- **Hardcoded `!` assertions on env vars** (payments/billing/route.ts:55-58): `process.env.SUPABASE_SERVICE_KEY!` crashes if env missing
- **`ignoreDuringBuilds: true`** (next.config.js:3-7): All ESLint errors suppressed, hiding real bugs
- **Missing CSP, HSTS, Permissions-Policy headers** (next.config.js): Critical for CRM with PII
- **`agent_own_calls` RLS SELECT-only** (migration 002): Agents can view only own calls but write ANY call in tenant
- **`role_based_tasks` RLS SELECT-only** (migration 002): Agents can write ANY task in tenant

### Business Logic
- **Status mismatch bugs** — code uses `'won'`, `'lost'`, `'interested'` but LEAD_STATUSES has `'closed_won'`, `'closed_lost'` (4 files affected: orchestrator.ts, leadScoreUpdater.ts)
- **`getCallDelay()` keys on `tenant.slug`** instead of billing plan → all tenants get same 30-sec delay (orchestrator.ts:558-577)
- **`conversion_rate` computes value ratio** not deal count ratio — dashboard shows wrong metric
- **`timeAgo()` returns negative values** for future dates (utils.ts:46-59)

### Frontend
- **Infinite re-render risk** in leads page — `useSearchParams()` in `useCallback` deps (leads/page.tsx:93)
- **Missing tenant headers** in property creation API call (NewPropertyForm.tsx:196-200)
- **Missing tenant context** in `getPropertyById()` call (properties/[id]/page.tsx:149)
- **Router.back() without history guard** — 5 pages crash on direct navigation
- **`dangerouslySetInnerHTML` with inline `<script>`** (layout.tsx:79-117) — XSS vector
- **Wrong property read** `maxCallDuration` instead of `maxConcurrentCalls` (AgentForm.tsx:148)

### Infrastructure
- **`playwright` in dependencies** (not devDeps) → ~400MB in production bundle
- **Duplicate Redis clients** (ioredis + @upstash/redis) → competing, ambiguous
- **`serverActions` under `experimental`** → deprecated in Next.js 15
- **No `@supabase/ssr` package** → no cookie-based auth in App Router (should use `createServerClient`)

---

## WHAT'S WORKING (verified)
✅ TypeScript strict — zero type errors (tsc passes)
✅ Next.js build — compiles successfully (6.6s)
✅ Dev server starts on localhost:3000
✅ API routes structurally correct (many are stubs)
✅ 200+ files generated with consistent patterns
✅ UI components render (but with mock data)

## ROOT CAUSE: WHY DEEPSEEK FLASH SAID "ZERO BUGS"

1. **TypeScript `strict: true` only catches TYPE errors** — not logic bugs, not stubs, not broken business rules
2. **Build passes because** — stub functions don't throw, commented-out code doesn't fail, missing API routes just return 404
3. **The code LOOKS complete** — proper file structure, all the right function signatures, all the right imports
4. **But it's a facade** — core functionality (login, registration, tenant isolation, DB writes) is all stubs

---

**Conclusion:** This codebase is a SKELETON/SCAFFOLD, not a working app. It has the right structure but almost NONE of the actual database integration, authentication, or business logic is functional. Every "COMPLETE ✅" status in the project memory was FALSE.
