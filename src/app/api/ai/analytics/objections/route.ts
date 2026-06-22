// ============================================================================
// EstateFlow CRM — AI Call Objections API
// GET /api/ai/analytics/objections — Top objections from call analytics
// Phase 3 — AI Voice Agent (AGENT-3-4-ANALYTICS-INSIGHTS)
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { getTopObjections } from '@/lib/ai/callAnalytics';
import { withRateLimit } from '@/lib/security/rateLimiter';
import { withTenantContext } from '@/lib/auth/withTenantContext';
import type { UserRole } from '@/types/auth';

// ---------------------------------------------------------------------------
// GET /api/ai/analytics/objections
// ---------------------------------------------------------------------------

/**
 * GET /api/ai/analytics/objections
 *
 * Query parameters:
 *   date_from  — ISO date string (default: 30 days ago)
 *   date_to    — ISO date string (default: today)
 *   limit      — Max number of objections to return (default: 10, max: 50)
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

    const dateTo = searchParams.get('date_to') || new Date().toISOString().slice(0, 10);
    const dateFromDate = new Date();
    dateFromDate.setDate(dateFromDate.getDate() - 30);
    const dateFrom = searchParams.get('date_from') || dateFromDate.toISOString().slice(0, 10);

    // Validate dates
    if (isNaN(Date.parse(dateFrom)) || isNaN(Date.parse(dateTo))) {
      return NextResponse.json(
        { success: false, data: null, error: 'Invalid date format. Use ISO 8601 (YYYY-MM-DD).', meta: null },
        { status: 400 },
      );
    }

    // ── Execute ────────────────────────────────────────────────────────────
    const objections = await withTenantContext(
      tenantId,
      userId,
      userRole || 'agent',
      () => getTopObjections(tenantId, dateFrom, dateTo),
    );

    return NextResponse.json(
      {
        success: true,
        data: objections,
        error: null,
        meta: {
          dateFrom,
          dateTo,
          total: objections.length,
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
    console.error('[api/ai/analytics/objections] GET error:', error);
    return NextResponse.json(
      { success: false, data: null, error: 'Internal server error', meta: null },
      { status: 500 },
    );
  }
}
