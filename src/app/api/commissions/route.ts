// ============================================================================
// EstateFlow CRM — Commissions API
// GET  /api/commissions     — Get agent/team commission records
// POST /api/commissions     — Calculate commission for a deal or create a rule
// Phase 6: Supporting Modules — Agent-6-2-Deals-Commissions
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { authenticate } from '@/middleware';
import { withRateLimit, rateLimitResponse } from '@/lib/security/rateLimiter';
import { withTenantContext } from '@/lib/auth/withTenantContext';
import { canRead, canCreate } from '@/lib/auth/permissions';
import {
  calculateCommission,
  getCommission,
  getTeamCommissions,
  createCommissionRule,
} from '@/lib/commissions/queries';

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const CalculateSchema = z.object({
  deal_id: z.string().uuid('Invalid deal ID'),
});

const CommissionRuleSchema = z.object({
  name: z.string().min(1).max(255),
  rule_type: z.enum(['percentage', 'fixed', 'tiered']),
  config: z.object({
    default_percentage: z.number().min(0).max(100).optional(),
    default_fixed: z.number().min(0).optional(),
    tiers: z
      .array(
        z.object({
          min_value: z.number().min(0),
          max_value: z.number().nullable(),
          percentage: z.number().min(0).max(100),
          fixed_amount: z.number().nullable(),
        }),
      )
      .optional(),
    agent_overrides: z.record(
      z.string().uuid(),
      z.object({
        percentage: z.number().min(0).max(100).optional(),
        fixed_amount: z.number().min(0).optional(),
      }),
    ).optional(),
  }),
  is_active: z.boolean().optional().default(true),
});

// ---------------------------------------------------------------------------
// GET /api/commissions
// ---------------------------------------------------------------------------

/**
 * GET /api/commissions
 *
 * Query parameters:
 *   agent_id   — Filter by agent UUID (required for individual view)
 *   date_from  — ISO date string filter (inclusive)
 *   date_to    — ISO date string filter (inclusive)
 *   month      — Month string "YYYY-MM" for team view (when agent_id is omitted)
 *
 * Returns individual or team commission data depending on query params.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // ── Auth ───────────────────────────────────────────────────────────────
    const auth = await authenticate(request);
    if (!auth) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      );
    }

    if (!canRead(auth.role, 'deals')) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: insufficient permissions' },
        { status: 403 },
      );
    }

    // ── Rate limit ─────────────────────────────────────────────────────────
    const { result: rlResult, headers: rlHeaders } = await withRateLimit(request, 'user', auth.userId);
    if (!rlResult.allowed) {
      return rateLimitResponse(rlResult);
    }

    // ── Parse query params ──────────────────────────────────────────────────
    const { searchParams } = request.nextUrl;
    const agentId = searchParams.get('agent_id') || auth.userId;
    const dateFrom = searchParams.get('date_from') || undefined;
    const dateTo = searchParams.get('date_to') || undefined;
    const month = searchParams.get('month') || undefined;

    let result;

    if (month && !agentId) {
      // Team view for a specific month
      result = await withTenantContext(
        auth.tenantId, auth.userId, auth.role,
        () => getTeamCommissions(auth.tenantId, month),
      );
    } else {
      // Individual agent commissions
      result = await withTenantContext(
        auth.tenantId, auth.userId, auth.role,
        () => getCommission(agentId, dateFrom, dateTo),
      );
    }

    return NextResponse.json(
      { success: true, data: result, error: null },
      { status: 200, headers: rlHeaders },
    );
  } catch (error) {
    console.error('[api/commissions] GET error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/commissions
// ---------------------------------------------------------------------------

/**
 * POST /api/commissions
 *
 * Two modes:
 *   1. Calculate commission for a deal: { deal_id: "<uuid>" }
 *   2. Create commission rule: { name, rule_type, config, is_active }
 *
 * Body includes a "mode" field or we infer from the shape.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // ── Auth ───────────────────────────────────────────────────────────────
    const auth = await authenticate(request);
    if (!auth) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      );
    }

    if (!canCreate(auth.role, 'deals')) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: insufficient permissions' },
        { status: 403 },
      );
    }

    // ── Rate limit ─────────────────────────────────────────────────────────
    const { result: rlResult, headers: rlHeaders } = await withRateLimit(request, 'user', auth.userId);
    if (!rlResult.allowed) {
      return rateLimitResponse(rlResult);
    }

    // ── Parse body ─────────────────────────────────────────────────────────
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON body' },
        { status: 400, headers: rlHeaders },
      );
    }

    const bodyRecord = body as Record<string, unknown>;

    // Determine mode: if deal_id is present, calculate; otherwise create rule
    if (bodyRecord.deal_id) {
      // Mode 1: Calculate commission
      const parsed = CalculateSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { success: false, error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
          { status: 400, headers: rlHeaders },
        );
      }

      const result = await withTenantContext(
        auth.tenantId, auth.userId, auth.role,
        () => calculateCommission(parsed.data.deal_id),
      );

      return NextResponse.json(
        { success: true, data: result, error: null },
        { status: 200, headers: rlHeaders },
      );
    }

    // Mode 2: Create commission rule
    const parsed = CommissionRuleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400, headers: rlHeaders },
      );
    }

    const rule = await withTenantContext(
      auth.tenantId, auth.userId, auth.role,
      () => createCommissionRule(auth.tenantId, parsed.data),
    );

    return NextResponse.json(
      { success: true, data: rule, error: null },
      { status: 201, headers: rlHeaders },
    );
  } catch (error) {
    console.error('[api/commissions] POST error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
