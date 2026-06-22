// ============================================================================
// EstateFlow CRM — Today's Attendance API
// GET /api/attendance/today — Get today's attendance for the current user
// Agent-6-1-Attendance-Calendar v1.0.0
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { getTodayAttendance } from '@/lib/attendance/queries';
import { withRateLimit } from '@/lib/security/rateLimiter';
import { withTenantContext } from '@/lib/auth/withTenantContext';
import type { UserRole } from '@/types/auth';

// ---------------------------------------------------------------------------
// GET /api/attendance/today
// ---------------------------------------------------------------------------

/**
 * GET /api/attendance/today
 *
 * Returns the current user's attendance record for today.
 * If no record exists (not yet checked in), returns null.
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

    // ── Execute ─────────────────────────────────────────────────────────────
    const record = await withTenantContext(
      tenantId,
      userId,
      userRole || 'agent',
      () => getTodayAttendance(tenantId, userId),
    );

    return NextResponse.json(
      {
        success: true,
        data: record,
        error: null,
        meta: null,
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
    console.error('[api/attendance/today] GET error:', error);
    return NextResponse.json(
      { success: false, data: null, error: 'Internal server error', meta: null },
      { status: 500 },
    );
  }
}
