// ============================================================================
// EstateFlow CRM — AI Call Trends API
// GET /api/ai/analytics/trends — Daily call volume and outcome trends
// Phase 3 — AI Voice Agent (AGENT-3-4-ANALYTICS-INSIGHTS)
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { getCallTrends } from '@/lib/ai/callAnalytics';
import { withRateLimit } from '@/lib/security/rateLimiter';
import { withTenantContext } from '@/lib/auth/withTenantContext';
import type { UserRole } from '@/types/auth';

// ---------------------------------------------------------------------------
// GET /api/ai/analytics/trends
// ---------------------------------------------------------------------------

/**
 * GET /api/ai/analytics/trends
 *
 * Query parameters:
 *   days  — Number of past days to include (default: 30, max: 365)
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

    let days = parseInt(searchParams.get('days') || '30', 10);
    if (isNaN(days) || days < 1) days = 30;
    if (days > 365) days = 365;

    // ── Execute ────────────────────────────────────────────────────────────
    const trends = await withTenantContext(
      tenantId,
      userId,
      userRole || 'agent',
      () => getCallTrends(tenantId, days),
    );

    return NextResponse.json(
      {
        success: true,
        data: trends,
        error: null,
        meta: {
          days,
          dateFrom: trends.length > 0 ? trends[0]!.date : null,
          dateTo: trends.length > 0 ? trends[trends.length - 1]!.date : null,
          totalDays: trends.length,
        },
      },
      {
        status: 200,
        headers: {
          ...rateHeaders,
          'X-Request-Id': requestId,
        },
      },
    );
  } catch (error) {
    console.error('[api/ai/analytics/trends] GET error:', error);
    return NextResponse.json(
      { success: false, data: null, error: 'Internal server error', meta: null },
      { status: 500 },
    );
  }
}
