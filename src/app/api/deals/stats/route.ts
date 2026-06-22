// ============================================================================
// EstateFlow CRM — Deal Pipeline Stats API
// GET /api/deals/stats — Pipeline value, avg deal size, win rate
// Phase 6: Supporting Modules — Agent-6-2-Deals-Commissions
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { getDealStats } from '@/lib/deals/queries';
import { withRateLimit, rateLimitResponse } from '@/lib/security/rateLimiter';
import { withTenantContext } from '@/lib/auth/withTenantContext';
import { canRead } from '@/lib/auth/permissions';
import { authenticate } from '@/middleware';

// ---------------------------------------------------------------------------
// GET /api/deals/stats
// ---------------------------------------------------------------------------

/**
 * GET /api/deals/stats
 *
 * Returns pipeline statistics for the authenticated tenant:
 *   pipeline_value   — Sum of all open deals
 *   avg_deal_size    — Average deal value
 *   win_rate         — Won / (Won + Lost)
 *   by_stage         — Count of deals per stage
 *   by_stage_value   — Total value per stage
 *
 * Response: { success, data: DealStats }
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

    // ── Execute ────────────────────────────────────────────────────────────
    const stats = await withTenantContext(
      auth.tenantId,
      auth.userId,
      auth.role,
      () => getDealStats(auth.tenantId),
    );

    return NextResponse.json(
      { success: true, data: stats, error: null },
      { status: 200, headers: rlHeaders },
    );
  } catch (error) {
    console.error('[api/deals/stats] GET error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
