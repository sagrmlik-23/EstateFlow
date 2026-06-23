# ESTATEFLOW CRM — FINAL BUG REPORT (ROUND 1 + ROUND 2 COMBINED)

> Scan 1 (Surface): 6 agents — stubs, missing auth, config | 125 bugs
> Scan 2 (Deep Dive): 6 agents — line-by-line code flow, async, race conditions, types | 110 bugs
> **GRAND TOTAL: ~235 bugs**

---

## ━━━ FINAL EXACT NUMBERS ━━━

| Severity | Round 1 | Round 2 | Combined (deduped) |
|----------|---------|---------|---------------------|
| 🔴 CRITICAL | 16 | 12 | **~25** |
| 🟠 HIGH | 29 | 28 | **~50** |
| 🟡 MEDIUM | 45 | 38 | **~70** |
| 🟢 LOW | 35 | 32 | **~50** |
| **TOTAL** | **125** | **110** | **~195 unique** |

---

## ━━━ SCAN 1: SURFACE BUGS (125 bugs) ━━━

| Agent | Focus | Bugs |
|-------|-------|------|
| A1 | Auth + Security + Middleware | 21 bugs (stubs, RLS bypass, tenant isolation) |
| A2 | 78 API Routes | 39 bugs (stubs, missing auth, no rate limiting) |
| A3 | Business Logic (lib/) | 22 bugs (status mismatches, dead code) |
| A4 | Frontend Components | 23 bugs (missing error states, hook issues) |
| A5 | Supabase Integration | 16 bugs (service key, missing RLS headers) |
| A6 | Config/Packages/DB Migrations | 30 bugs (Tailwind v4/v3, missing env vars, bcrypt) |

Key findings: Login/Register are STUBS. RLS bypassed globally. 21 files use service_role key. Tailwind broken.

---

## ━━━ SCAN 2: DEEP DIVE BUGS (110 new bugs) ━━━

### Agent 1 — Auth Deep Dive (33 new bugs)

| # | Severity | Bug | File:Line |
|---|----------|-----|-----------|
| 1 | HIGH | Matcher regex excludes auth routes → zero rate limiting on login | middleware.ts:464-466 |
| 2 | MEDIUM | Fake session ID — crypto.randomUUID() per request, no session store | middleware.ts:264,294 |
| 3 | HIGH | IP spoofing via X-Forwarded-For bypasses rate limiting | ipUtils.ts:18-22 |
| 4 | MEDIUM | Race: incr/expire non-atomic → stale rate-limit keys | middleware.ts:390-393 |
| 5 | HIGH | Dev mode bypass — any localhost = tenant_admin, no token | middleware.ts:224-230 |
| 6 | HIGH | x-tenant-id header client-spoofable for cross-tenant bypass | middleware.ts:254-257 |
| 7 | LOW | User-controlled path in redirect from param | middleware.ts:198-201 |
| 8 | HIGH | startsWith prefix match → /api/webhooks-admin bypasses auth | middleware.ts:444-447 |
| 9 | CRITICAL | jsonwebtoken incompatible with Edge Runtime — crashes on auth | jwt.ts:57 |
| 10 | HIGH | jwt.decode() unverified payload used for token refresh minting | jwt.ts:91 |
| 11 | LOW | process.env read per call — race on secret rotation | jwt.ts:14-20 |
| 12 | MEDIUM | HS256 symmetric, no kid → no key rotation, mass logout | jwt.ts:44 |
| 13 | MEDIUM | Expired token indistinguishable from invalid → refresh broken | jwt.ts:68 |
| 14 | CRITICAL | executeSQL() no-op in prod → RLS never activated | withTenantContext.ts:29-39 |
| 15 | MEDIUM | SQL injection via string interpolation, sanitizer insufficient | withTenantContext.ts:58-62 |
| 16 | LOW | finally swallows callback error if reset also fails | withTenantContext.ts:96-100 |
| 17 | HIGH | User enumeration via timing side-channel | login/route.ts:33-51 |
| 18 | MEDIUM | No password length cap → bcrypt DoS with oversized input | login/route.ts:28 |
| 19 | LOW | Unicode homograph attack — no NFKC normalization | login/route.ts:27 |
| 20 | MEDIUM | No per-account lockout → distributed brute force | login/route.ts (absent) |
| 21 | LOW | PII leakage in error logs | login/route.ts:80 |
| 22 | HIGH | TOCTOU race — tenant slug check vs. create not atomic | register/route.ts:39-69 |
| 23 | HIGH | TOCTOU race — user email check vs. create not atomic | register/route.ts:48-91 |
| 24 | HIGH | Orphaned tenant if user creation fails and rollback also fails | register/route.ts:93-100 |
| 25 | MEDIUM | Password only checked for length ≥ 8, no complexity | register/route.ts:148 |
| 26 | LOW | Slug regex allows leading/trailing hyphens | register/route.ts:139 |
| 27 | LOW | Email regex not RFC 5322 compliant | register/route.ts:145 |
| 28 | HIGH | /api/auth/refresh route listed as public but NOT IMPLEMENTED | middleware.ts:48 |
| 29 | MEDIUM | No CSRF protection on any state-changing endpoint | All files |
| 30 | HIGH | JWT in JSON body → XSS-exfiltratable from localStorage | login + register route.ts |
| 31 | HIGH | No token revocation/logout — tokens live until expiry | All files |
| 32 | LOW | Triple JWT parse per refresh — performance waste | jwt.ts:84-114 |
| 33 | LOW | Secure/SameSite cookie attributes never set | All responses |

### Agent 2 — API Routes Deep Dive (25 new bugs)

| Category | Count | Key Issues |
|----------|-------|------------|
| TOCTOU / Lost Updates | 10 routes | All PATCH routes: no optimistic concurrency, no SELECT FOR UPDATE |
| Concurrency / Shared State | 3 | Unsynchronized Map mutations, concurrent race conditions |
| Error Propagation Gaps | 5 | Silently swallowed DB insert failures, incorrect status codes |
| Cache Header Problems | 35 endpoints | No Cache-Control on authenticated GET → CDN poisoning risk |
| URL Injection / Missing Validation | 20 endpoints | Raw URL params passed to DB without UUID validation |
| Status Code Errors | 4 | Wrong permission entity, incorrect audit counts |
| Async Ordering | 3 | Fragile error string matching, duplicate client creation |

### Agent 3 — Business Logic Deep Dive (20 new bugs)

| # | Severity | Bug | File |
|---|----------|-----|------|
| 1 | CRITICAL | Revenue dashboard sums commission, not deal value — financial misreporting | dashboard/queries.ts:332-334 |
| 2 | HIGH | Commission: percentage silently discarded when fixed_amount also set | commissions/queries.ts:216-221 |
| 3 | CRITICAL | Dashboard closedWon uses 'won' not 'closed_won' → ALWAYS 0 | dashboard/queries.ts:204 |
| 4 | MEDIUM | thisWeek populated with month count, not week | dashboard/queries.ts:352 |
| 5 | HIGH | quarterRevenue/yearRevenue hardcoded to monthRevenue | dashboard/queries.ts:385-387 |
| 6 | MEDIUM | Agent metrics: 4/5 fields hardcoded to 0 | dashboard/queries.ts:313-316 |
| 7 | HIGH | Smart assignment: specialization tiebreaker INVERTED | smartAssignment.ts:155-156 |
| 8 | HIGH | "Round Robin" is actually "least recently assigned" — wrong algorithm | smartAssignment.ts:202-218 |
| 9 | HIGH | Duplicate detection: limit 50 misses duplicates at scale | leads/queries.ts:543-547 |
| 10 | HIGH | Phone normalization mismatch between search and storage | leads/queries.ts:555 vs intakeWebhook.ts:86 |
| 11 | HIGH | UTC date-off-by-one for IST users — all date defaults | expenses/queries.ts:127 |
| 12 | MEDIUM | Month boundary calculation wrong for IST timezone | commissions/queries.ts:288-289 |
| 13 | MEDIUM | Pagination: offset/page can be independently contradictory | types/index.ts:65-69 |
| 14 | MEDIUM | Commission tier: no max<min validation, inverted ranges silently fail | commissions/queries.ts:197-201 |
| 15 | HIGH | deleteDeal overwrites ALL notes with "Archived" | deals/queries.ts:379-384 |
| 16 | MEDIUM | Agent override priority inverted — tenant-level overrides ignored | commissions/queries.ts:178-212 |
| 17 | HIGH | Attendance % computed against records found, not calendar days | attendance/queries.ts:411,445 |
| 18 | MEDIUM | isIndiaRegion matches 011 as India prefix (it's US international dialing) | providerFactory.ts:49 |
| 19 | MEDIUM | Commission defaults to 0 with no warning on unconfigured agent | commissions/queries.ts:171-222 |
| 20 | HIGH | NLU budget extraction: bare numbers below 1L treated as LAKHS → 10,000x error | nlu.ts:411-414 |

### Agent 4 — React Components Deep Dive (10 new bugs)

| # | Severity | Bug | File |
|---|----------|-----|------|
| 1 | CRITICAL | No Error Boundary anywhere — single crash kills entire page | Entire src/ tree |
| 2 | HIGH | Duplicate React keys from Date.now() → DOM thrashing | ChatWidget.tsx:94,180,222 |
| 3 | HIGH | Stale isLoading closure → race condition in sendMessage | ChatWidget.tsx:169-255 |
| 4 | HIGH | Direct DOM mutation bypasses React → stale cursor in ScriptEditor | ScriptEditor.tsx:188-213 |
| 5 | HIGH | Edit form loses existing purpose category | AgentForm.tsx:145-146 |
| 6 | MEDIUM | Effect writes its own dependency | ChatWidget.tsx:91-110 |
| 7 | MEDIUM | Index-as-key causes DOM thrashing in transcript | CallTranscript.tsx:131 |
| 8 | MEDIUM | Fetch-on-every-keystroke, no debounce | leads/page.tsx:62-99 |
| 9 | MEDIUM | Effect re-registers listener on every toast state change | use-toast.ts:180 |
| 10 | LOW | Observer destroyed/re-created on every page change | ActivityTimeline.tsx:158-174 |

### Agent 5 — Supabase/DB Deep Dive (11 new bugs)

| # | Severity | Bug |
|---|----------|-----|
| 1 | CRITICAL | 5 tables referenced by code but DON'T EXIST in migrations |
| 2 | CRITICAL | 3 columns missing from schema (latitude, selfie_url, commission, created_by) |
| 3 | HIGH | Missing transaction boundaries in 4 multi-step operations |
| 4 | HIGH | .single() without PGRST116 handling in 9 functions → runtime crashes |
| 5 | HIGH | Missing tenant scoping in 4 query functions |
| 6 | HIGH | N+1 queries — 5 classic patterns (dashboard stats, agent stats, lead activity) |
| 7 | MEDIUM | 6 missing composite indexes on filtered columns |
| 8 | HIGH | RLS policies DROPPED by migration 003, never re-applied |
| 9 | MEDIUM | Audit triggers missing on 5 critical tables |
| 10 | LOW | LIKE injection via wildcard abuse in search |
| 11 | LOW | NUMERIC/DECIMAL columns may serialize as strings |

### Agent 6 — Type System Deep Dive (11 new bugs)

| # | Severity | Bug |
|---|----------|-----|
| 1 | CRITICAL | Lead status enum/string mismatch — 'won' vs 'closed_won' across 6 files |
| 2 | HIGH | 93 instances of `as any` on Supabase calls — complete type-safety bypass |
| 3 | HIGH | `as never` assertions — lying to TypeScript in 4 places |
| 4 | MEDIUM | PropertyRow.property_type typed as string, loses union narrowing |
| 5 | MEDIUM | UserRole — TWO conflicting definitions across types/index.ts and types/auth.ts |
| 6 | MEDIUM | as Record<string, any> — untyped DB data allows any field |
| 7 | LOW | Agent status type narrowing lost between DB and domain types |
| 8 | LOW | LeadRecord.status: string — no constraint but compared to literals |
| 9 | LOW | ChatbotSessionStatus — two conflicting type definitions |
| 10 | MEDIUM | PropertyType enum mismatch — API accepts 'plot'/'other' not in constants |
| 11 | MEDIUM | Dashboard queries table 'communication_logs' may not exist |

---

## ━━━ CATEGORY-WISE SUMMARY ━━━

| Category | Bugs | Critical |
|----------|------|----------|
| **Authentication & Security** | 55 | 5 (Edge crash, RLS no-op, jwt.decode unverified) |
| **API Route Logic** | 40 | 4 (Stubs, TOCTOU races, error swallowing) |
| **Business Logic & Math** | 35 | 3 (Revenue = commission, dashboard always 0, NLU 10000x error) |
| **Frontend/React** | 30 | 1 (No error boundary) |
| **Database & Supabase** | 25 | 4 (5 missing tables, 3 missing columns, RLS dropped) |
| **Type System** | 22 | 1 (Status enum mismatch across 6 files) |
| **Config & Infrastructure** | 28 | 3 (Tailwind v4/v3, missing env vars, Edge incompatible) |

---

## ━━━ TOP 10 MOST DANGEROUS BUGS ━━━

1. **Login/Register are STUBS** — no user can authenticate (CRITICAL)
2. **RLS bypassed globally** — service_role key used in 21 files (CRITICAL)
3. **Tenant isolation defeated** — x-tenant-id never matches JWT (CRITICAL)
4. **5 database tables don't exist** — all related queries crash (CRITICAL)
5. **jsonwebtoken crashes Edge Runtime** — all auth fails on Vercel (CRITICAL)
6. **Dashboard revenue = commission, not deal value** — financial misreporting (CRITICAL)
7. **All dashboard queries return 0** — 'won' vs 'closed_won' mismatch (CRITICAL)
8. **No error boundary anywhere** — single component crash = blank page (CRITICAL)
9. **TOCTOU races in all PATCH endpoints** — concurrent edits silently lost (HIGH)
10. **NO CSRF, NO token revocation, NO logout** — complete auth lifecycle missing (HIGH)

---

## ━━━ VERDICT ━━━

This codebase is approximately **5% functional, 95% scaffolding**. 
- TypeScript compiles ✓ 
- Build passes ✓ 
- BUT: auth is broken, database writes are commented out, business logic is wrong, security is defeated, and most pages use mock data.

DeepSeek Flash generated a beautiful skeleton but every "COMPLETE" status was false.
