// ============================================================================
// EstateFlow CRM — Deals List & Create API
// GET  /api/deals        — List deals with pagination, filters
// POST /api/deals        — Create a new deal
// Phase 6: Supporting Modules — Agent-6-2-Deals-Commissions
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { buildPaginationParams } from '@/lib/types';
import {
  getDeals,
  createDeal,
  type DealFilters,
} from '@/lib/deals/queries';
import { withRateLimit, extractClientIp } from '@/lib/security/rateLimiter';
import { logCreate } from '@/lib/security/auditLogger';
import { withTenantContext } from '@/lib/auth/withTenantContext';
import type { UserRole } from '@/types/auth';

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const ALLOWED_STAGES = [
  'qualification',
  'proposal',
  'negotiation',
  'closed_won',
  'closed_lost',
] as const;

const createDealSchema = z.object({
  lead_id: z.string().uuid().nullable().optional(),
  property_id: z.string().uuid().nullable().optional(),
  title: z.string().min(1, 'Title is required').max(255),
  value: z.number().nonnegative('Value must be non-negative'),
  stage: z.enum(ALLOWED_STAGES).optional().default('qualification'),
  probability: z.number().int().min(0).max(100).nullable().optional(),
  expected_close: z.string().nullable().optional(),
  assigned_to: z.string().uuid().nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
});

export type CreateDealBody = z.infer<typeof createDealSchema>;

// ---------------------------------------------------------------------------
// GET /api/deals
// ---------------------------------------------------------------------------

/**
 * GET /api/deals?page=1&limit=20&stage=negotiation&assigned_to=<uuid>
 *
 * Query parameters:
 *   page, limit             — Pagination
 *   stage                   — Filter by pipeline stage
 *   assigned_to             — Filter by assigned agent UUID
 *   lead_id                 — Filter by lead UUID
 *   property_id             — Filter by property UUID
 *   value_min, value_max    — Deal value range
 *   probability_min/max     — Probability range
 *   created_after/before    — ISO date string (inclusive)
 *   expected_close_before/after — Expected close date range
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // ── Auth headers ───────────────────────────────────────────────────────
    const userId = request.headers.get('x-user-id');
    const tenantId = request.headers.get('x-tenant-id');
    const userRole = request.headers.get('x-user-role') as UserRole | null;
    const requestId = request.headers.get('x-session-id') || crypto.randomUUID();

    if (!userId || !tenantId) {
      return NextResponse.json(
        { success: false, data: null, error: 'Unauthorized — missing auth headers', meta: null },
        { status: 401 },
      );
    }

    // ── Rate limit ─────────────────────────────────────────────────────────
    const { result: rateResult, headers: rateHeaders } = await withRateLimit(
      request,
      'user',
      userId,
    );
    if (!rateResult.allowed) {
      return NextResponse.json(
        { success: false, data: null, error: 'Too many requests', meta: null },
        { status: 429, headers: rateHeaders },
      );
    }

    // ── Parse query params ──────────────────────────────────────────────────
    const { searchParams } = request.nextUrl;
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const pagination = buildPaginationParams(page, limit);

    const filters: DealFilters = {};

    const stage = searchParams.get('stage') || undefined;
    if (stage && !(ALLOWED_STAGES as readonly string[]).includes(stage)) {
      return NextResponse.json(
        { success: false, data: null, error: `Invalid stage. Allowed: ${ALLOWED_STAGES.join(', ')}`, meta: null },
        { status: 400 },
      );
    }
    if (stage) filters.stage = stage;

    if (searchParams.get('assigned_to')) filters.assigned_to = searchParams.get('assigned_to')!;
    if (searchParams.get('lead_id')) filters.lead_id = searchParams.get('lead_id')!;
    if (searchParams.get('property_id')) filters.property_id = searchParams.get('property_id')!;
    if (searchParams.get('value_min')) filters.value_min = parseFloat(searchParams.get('value_min')!);
    if (searchParams.get('value_max')) filters.value_max = parseFloat(searchParams.get('value_max')!);
    if (searchParams.get('probability_min')) filters.probability_min = parseInt(searchParams.get('probability_min')!, 10);
    if (searchParams.get('probability_max')) filters.probability_max = parseInt(searchParams.get('probability_max')!, 10);
    if (searchParams.get('created_after')) filters.created_after = searchParams.get('created_after')!;
    if (searchParams.get('created_before')) filters.created_before = searchParams.get('created_before')!;
    if (searchParams.get('expected_close_before')) filters.expected_close_before = searchParams.get('expected_close_before')!;
    if (searchParams.get('expected_close_after')) filters.expected_close_after = searchParams.get('expected_close_after')!;

    // ── Execute ───────────────────────────────────────────────────────────
    const result = await withTenantContext(
      tenantId,
      userId,
      userRole || 'agent',
      () => getDeals(tenantId, filters, pagination),
    );

    return NextResponse.json(
      {
        success: true,
        data: result.data,
        error: null,
        meta: result.meta,
      },
      {
        status: 200,
        headers: {
          ...rateHeaders,
          'Cache-Control': 'private, no-store',
          'X-Request-Id': requestId,
        },
      },
    );
  } catch (error) {
    console.error('[api/deals] GET error:', error);
    return NextResponse.json(
      { success: false, data: null, error: 'Internal server error', meta: null },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/deals
// ---------------------------------------------------------------------------

/**
 * POST /api/deals
 *
 * Creates a new deal in the pipeline (typically from a qualified lead).
 *
 * Body: CreateDealBody (see Zod schema above)
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // ── Auth headers ───────────────────────────────────────────────────────
    const userId = request.headers.get('x-user-id');
    const tenantId = request.headers.get('x-tenant-id');
    const userRole = request.headers.get('x-user-role') as UserRole | null;
    const requestId = request.headers.get('x-session-id') || crypto.randomUUID();
    const clientIp = extractClientIp(request);
    const userAgent = request.headers.get('user-agent') || null;

    if (!userId || !tenantId) {
      return NextResponse.json(
        { success: false, data: null, error: 'Unauthorized — missing auth headers', meta: null },
        { status: 401 },
      );
    }

    // ── Rate limit ─────────────────────────────────────────────────────────
    const { result: rateResult, headers: rateHeaders } = await withRateLimit(
      request,
      'user',
      userId,
    );
    if (!rateResult.allowed) {
      return NextResponse.json(
        { success: false, data: null, error: 'Too many requests', meta: null },
        { status: 429, headers: rateHeaders },
      );
    }

    // ── Parse & validate body ──────────────────────────────────────────────
    const body = await request.json();
    const parsed = createDealSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          data: null,
          error: parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; '),
          meta: null,
        },
        { status: 400 },
      );
    }

    // ── Execute ────────────────────────────────────────────────────────────
    const deal = await withTenantContext(
      tenantId,
      userId,
      userRole || 'agent',
      () => createDeal(parsed.data, tenantId, userId),
    );

    // ── Audit log ─────────────────────────────────────────────────────────
    await logCreate(
      'deal',
      deal.id,
      {
        title: deal.title,
        value: deal.value,
        stage: deal.stage,
        assigned_to: deal.assigned_to,
      },
      { ipAddress: clientIp, userAgent, requestId },
    );

    return NextResponse.json(
      {
        success: true,
        data: deal,
        error: null,
        meta: null,
      },
      {
        status: 201,
        headers: {
          ...rateHeaders,
          'X-Request-Id': requestId,
        },
      },
    );
  } catch (error) {
    console.error('[api/deals] POST error:', error);
    return NextResponse.json(
      { success: false, data: null, error: 'Internal server error', meta: null },
      { status: 500 },
    );
  }
}
