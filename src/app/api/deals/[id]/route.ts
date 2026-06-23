// ============================================================================
// EstateFlow CRM — Single Deal API Route
// GET    /api/deals/[id] — Get a deal with lead/property details
// PATCH  /api/deals/[id] — Update a deal
// DELETE /api/deals/[id] — Archive a deal
// Phase 6: Supporting Modules — Agent-6-2-Deals-Commissions
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { authenticate } from '@/middleware';
import { withRateLimit, rateLimitResponse } from '@/lib/security/rateLimiter';
import { logUpdate, logDelete } from '@/lib/security/auditLogger';
import { withTenantContext } from '@/lib/auth/withTenantContext';
import { canRead, canUpdate, canDelete } from '@/lib/auth/permissions';
import {
  getDealById,
  updateDeal,
  deleteDeal,
  updateDealStage,
} from '@/lib/deals/queries';

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const ALLOWED_STAGES = [
  'qualification', 'proposal', 'negotiation',
  'closed_won', 'closed_lost',
] as const;

const ALLOWED_STAGE_ENUM = ALLOWED_STAGES as unknown as [string, ...string[]];

const UpdateDealSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  value: z.number().min(0).optional(),
  stage: z.enum(ALLOWED_STAGE_ENUM).optional(),
  probability: z.number().int().min(0).max(100).nullable().optional(),
  expected_close: z.string().nullable().optional(),
  assigned_to: z.string().uuid().nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
});

const PatchStageSchema = z.object({
  stage: z.enum(ALLOWED_STAGE_ENUM, { required_error: 'stage is required' }),
});

const IdParamsSchema = z.object({
  id: z.string().uuid('Invalid deal ID format'),
});

// ---------------------------------------------------------------------------
// GET — Get single deal with full details
// ---------------------------------------------------------------------------

/**
 * GET /api/deals/[id]
 *
 * Response: { success, data: { ...deal, lead, property } }
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await params;

    // ── Validate param ─────────────────────────────────────────────────────
    const paramResult = IdParamsSchema.safeParse({ id });
    if (!paramResult.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid deal ID', details: paramResult.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

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

    // ── Execute ────────────────────────────────────────────────────────────
    const result = await withTenantContext(
      auth.tenantId,
      auth.userId,
      auth.role,
      () => getDealById(id),
    );

    if (!result) {
      return NextResponse.json(
        { success: false, error: 'Deal not found' },
        { status: 404, headers: rlHeaders },
      );
    }

    return NextResponse.json(
      { success: true, data: result, error: null },
      { status: 200, headers: rlHeaders },
    );
  } catch (error) {
    console.error('[api/deals/[id]] GET error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// PATCH — Update a deal (including stage movement)
// ---------------------------------------------------------------------------

/**
 * PATCH /api/deals/[id]
 *
 * Can update deal fields OR move deal through pipeline stages.
 * If only `stage` is provided, uses updateDealStage for proper pipeline logic.
 *
 * Body: Partial<CreateDealInput> | { stage }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await params;

    // ── Validate param ─────────────────────────────────────────────────────
    const paramResult = IdParamsSchema.safeParse({ id });
    if (!paramResult.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid deal ID', details: paramResult.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    // ── Auth + permissions ─────────────────────────────────────────────────
    const auth = await authenticate(request);
    if (!auth) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (!canUpdate(auth.role, 'deals')) {
      return NextResponse.json({ success: false, error: 'Forbidden: insufficient permissions' }, { status: 403 });
    }

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

    // Check if it's a stage-only update
    if (body && typeof body === 'object' && 'stage' in (body as Record<string, unknown>) && Object.keys(body as Record<string, unknown>).length === 1) {
      const parsed = PatchStageSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          { success: false, error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
          { status: 400, headers: rlHeaders },
        );
      }

      // ── Fetch old values for audit ────────────────────────────────────────
      const oldDeal = await withTenantContext(
        auth.tenantId, auth.userId, auth.role,
        () => getDealById(id),
      );
      if (!oldDeal) {
        return NextResponse.json({ success: false, error: 'Deal not found' }, { status: 404, headers: rlHeaders });
      }

      // ── Execute stage update ──────────────────────────────────────────────
      const result = await withTenantContext(
        auth.tenantId, auth.userId, auth.role,
        () => updateDealStage(id, parsed.data.stage),
      );

      await logUpdate(
        'deal', id,
        { stage: oldDeal.stage, closed_at: oldDeal.closed_at },
        { stage: parsed.data.stage },
        { ipAddress: request.headers.get('x-forwarded-for') ?? null, userAgent: request.headers.get('user-agent') ?? null, requestId: request.headers.get('x-session-id') ?? null },
      );

      return NextResponse.json({ success: true, data: result, error: null }, { status: 200, headers: rlHeaders });
    }

    // Full update
    const parsed = UpdateDealSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400, headers: rlHeaders },
      );
    }

    if (Object.keys(parsed.data).length === 0) {
      return NextResponse.json(
        { success: false, error: 'No fields to update' },
        { status: 400, headers: rlHeaders },
      );
    }

    // ── Fetch old values for audit log ─────────────────────────────────────
    const oldDeal = await withTenantContext(
      auth.tenantId, auth.userId, auth.role,
      () => getDealById(id),
    );
    if (!oldDeal) {
      return NextResponse.json({ success: false, error: 'Deal not found' }, { status: 404, headers: rlHeaders });
    }

    // ── Execute update ─────────────────────────────────────────────────────
    let result;
    if (parsed.data.stage) {
      // Use stage-specific update if stage is being changed
      result = await withTenantContext(
        auth.tenantId, auth.userId, auth.role,
        () => updateDealStage(id, parsed.data.stage!),
      );
      // Apply remaining fields
      const rest: Record<string, unknown> = { ...parsed.data };
      delete rest.stage;
      if (Object.keys(rest).length > 0) {
        result = await withTenantContext(
          auth.tenantId, auth.userId, auth.role,
          () => updateDeal(id, rest),
        );
      }
    } else {
      result = await withTenantContext(
        auth.tenantId, auth.userId, auth.role,
        () => updateDeal(id, parsed.data),
      );
    }

    // ── Audit log ──────────────────────────────────────────────────────────
    const oldValues: Record<string, unknown> = {};
    const newData = parsed.data as Record<string, unknown>;
    for (const key of Object.keys(newData)) {
      if (key in (oldDeal as unknown as Record<string, unknown>)) {
        oldValues[key] = (oldDeal as unknown as Record<string, unknown>)[key];
      }
    }

    await logUpdate(
      'deal', id, oldValues, newData,
      { ipAddress: request.headers.get('x-forwarded-for') ?? null, userAgent: request.headers.get('user-agent') ?? null, requestId: request.headers.get('x-session-id') ?? null },
    );

    return NextResponse.json({ success: true, data: result, error: null }, { status: 200, headers: rlHeaders });
  } catch (error) {
    console.error('[api/deals/[id]] PATCH error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// DELETE — Archive a deal
// ---------------------------------------------------------------------------

/**
 * DELETE /api/deals/[id]
 *
 * Archives the deal (soft delete — sets stage to closed_lost).
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await params;

    // ── Validate param ─────────────────────────────────────────────────────
    const paramResult = IdParamsSchema.safeParse({ id });
    if (!paramResult.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid deal ID', details: paramResult.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    // ── Auth + permissions ─────────────────────────────────────────────────
    const auth = await authenticate(request);
    if (!auth) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (!canDelete(auth.role, 'deals')) {
      return NextResponse.json({ success: false, error: 'Forbidden: insufficient permissions' }, { status: 403 });
    }

    const { result: rlResult, headers: rlHeaders } = await withRateLimit(request, 'user', auth.userId);
    if (!rlResult.allowed) {
      return rateLimitResponse(rlResult);
    }

    // ── Fetch old values for audit log ─────────────────────────────────────
    const oldDeal = await withTenantContext(
      auth.tenantId, auth.userId, auth.role,
      () => getDealById(id),
    );
    if (!oldDeal) {
      return NextResponse.json({ success: false, error: 'Deal not found' }, { status: 404, headers: rlHeaders });
    }

    // ── Execute delete (archive) ───────────────────────────────────────────
    await withTenantContext(
      auth.tenantId, auth.userId, auth.role,
      () => deleteDeal(id),
    );

    // ── Audit log ──────────────────────────────────────────────────────────
    await logDelete(
      'deal', id,
      oldDeal as unknown as Record<string, unknown>,
      { ipAddress: request.headers.get('x-forwarded-for') ?? null, userAgent: request.headers.get('user-agent') ?? null, requestId: request.headers.get('x-session-id') ?? null },
    );

    return NextResponse.json({ success: true, data: null, error: null }, { status: 200, headers: rlHeaders });
  } catch (error) {
    console.error('[api/deals/[id]] DELETE error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
