// ============================================================================
// EstateFlow CRM — Property Stats API Route
// GET /api/properties/stats — Property statistics for a tenant
// Phase 2: Core CRM — Agent-2-2-API-Properties
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { authenticate } from '@/middleware';
import { withRateLimit, rateLimitResponse } from '@/lib/security/rateLimiter';
import { withTenantContext } from '@/lib/auth/withTenantContext';
import { canRead } from '@/lib/auth/permissions';
import { getPropertyStats } from '@/lib/properties/queries';

// ---------------------------------------------------------------------------
// GET — Property stats
// ---------------------------------------------------------------------------

/**
 * GET /api/properties/stats
 *
 * Returns aggregated property statistics for the authenticated tenant:
 *   - total_properties
 *   - by_type (counts per property type)
 *   - by_status (counts per availability status)
 *   - price_range (min, max, avg)
 *   - total_bedrooms_breakdown
 *
 * Response: { success, data: PropertyStats }
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

    // ── Permission check ───────────────────────────────────────────────────
    if (!canRead(auth.role, 'properties')) {
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

    // ── Execute within tenant context ──────────────────────────────────────
    const result = await withTenantContext(
      auth.tenantId,
      auth.userId,
      auth.role,
      () => getPropertyStats(auth.tenantId),
    );

    if (!result.success) {
      return NextResponse.json(result, { status: 500, headers: rlHeaders });
    }

    return NextResponse.json(result, {
      status: 200,
      headers: {
        ...rlHeaders,
        'Cache-Control': 'private, max-age=30', // Short cache for stats
      },
    });
  } catch (error) {
    console.error('[properties/stats] GET error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
