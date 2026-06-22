import { NextResponse, type NextRequest } from 'next/server';
import { getRecentActivity } from '@/lib/dashboard/queries';
import { authenticate } from '@/middleware';
import { withRateLimit } from '@/lib/security/rateLimiter';

/**
 * GET /api/dashboard/recent-activity
 *
 * Returns the most recent activity timeline entries for the authenticated tenant.
 *
 * Query params:
 *   limit (optional) — max entries to return (default 20, max 100)
 *
 * Headers:
 *   Authorization: Bearer ***
 *
 * Response:
 *   200: { success: true, data: ActivityEntry[] }
 *   401: { success: false, error: 'Unauthorized' }
 *   429: { success: false, error: 'Too many requests' }
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // ── Authenticate ─────────────────────────────────────────────────
    const auth = await authenticate(request);
    if (!auth) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      );
    }

    // ── Rate Limit ───────────────────────────────────────────────────
    const { result: rateLimitResult } = await withRateLimit(
      request,
      'user',
      auth.userId,
    );
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many requests. Please try again later.' },
        {
          status: 429,
          headers: {
            'Retry-After': String(rateLimitResult.resetIn),
            'X-RateLimit-Limit': String(rateLimitResult.limit),
            'X-RateLimit-Remaining': '0',
          },
        },
      );
    }

    // ── Parse Query Params ───────────────────────────────────────────
    const { searchParams } = request.nextUrl;
    const limitParam = searchParams.get('limit');
    const limit = Math.min(100, Math.max(1, limitParam ? parseInt(limitParam, 10) : 20));

    // ── Fetch Activity ───────────────────────────────────────────────
    const activities = await getRecentActivity(auth.tenantId, limit);

    return NextResponse.json(
      { success: true, data: activities },
      { status: 200 },
    );
  } catch (error) {
    console.error('[dashboard/recent-activity]', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
