// ============================================================================
// EstateFlow CRM — Available Properties API Route
// GET /api/properties/available — List available properties only
// Phase 2: Core CRM — Agent-2-2-API-Properties
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { authenticate } from '@/middleware';
import { withRateLimit, rateLimitResponse } from '@/lib/security/rateLimiter';
import { withTenantContext } from '@/lib/auth/withTenantContext';
import { canRead } from '@/lib/auth/permissions';
import { getAvailableProperties } from '@/lib/properties/queries';

// ---------------------------------------------------------------------------
// GET — Available properties
// ---------------------------------------------------------------------------

/**
 * GET /api/properties/available
 *
 * Returns only properties with availability_status in ['available', 'under_offer'].
 * This is intended for lead assignment, deal creation, and public-facing listings.
 *
 * Response: { success, data: PropertyRow[] }
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
      () => getAvailableProperties(auth.tenantId),
    );

    if (!result.success) {
      return NextResponse.json(result, { status: 500, headers: rlHeaders });
    }

    return NextResponse.json(result, {
      status: 200,
      headers: {
        ...rlHeaders,
        'Cache-Control': 'private, max-age=60',
      },
    });
  } catch (error) {
    console.error('[properties/available] GET error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
