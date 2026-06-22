import { NextResponse, type NextRequest } from 'next/server';
import { getAgentStats } from '@/lib/dashboard/queries';
import { authenticate } from '@/middleware';
import { withRateLimit } from '@/lib/security/rateLimiter';

/**
 * GET /api/dashboard/agent-stats
 *
 * Returns per-agent performance metrics for the authenticated tenant.
 *
 * Headers:
 *   Authorization: Bearer ***
 *
 * Response:
 *   200: { success: true, data: AgentMetric[] }
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

    // ── Fetch Agent Stats ────────────────────────────────────────────
    const stats = await getAgentStats(auth.tenantId);

    return NextResponse.json(
      { success: true, data: stats },
      { status: 200 },
    );
  } catch (error) {
    console.error('[dashboard/agent-stats]', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
