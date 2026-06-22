import { NextResponse, type NextRequest } from 'next/server';
import { getDashboardStats } from '@/lib/dashboard/queries';
import { authenticate } from '@/middleware';
import { withRateLimit } from '@/lib/security/rateLimiter';
import { auditLog } from '@/lib/security/auditLogger';

/**
 * GET /api/dashboard/stats
 *
 * Returns aggregated dashboard statistics for the authenticated tenant.
 *
 * Headers:
 *   Authorization: Bearer <token>
 *
 * Response:
 *   200: { success: true, data: DashboardStats }
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

    // ── Fetch Stats ──────────────────────────────────────────────────
    const stats = await getDashboardStats(auth.tenantId);

    // ── Audit Log ────────────────────────────────────────────────────
    await auditLog({
      tenantId: auth.tenantId,
      userId: auth.userId,
      action: 'view',
      entityType: 'dashboard_stats',
      entityId: auth.tenantId,
      oldValues: null,
      newValues: null,
      ipAddress: request.headers.get('x-forwarded-for') ?? null,
      userAgent: request.headers.get('user-agent') ?? null,
      requestId: auth.sessionId,
    });

    return NextResponse.json(
      { success: true, data: stats },
      { status: 200 },
    );
  } catch (error) {
    console.error('[dashboard/stats]', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
