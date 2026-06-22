// ============================================================================
// EstateFlow CRM — Attendance API
// POST  /api/attendance  — Mark attendance (check-in/out with GPS + selfie)
// GET   /api/attendance  — Get attendance records for a date range
// Agent-6-1-Attendance-Calendar v1.0.0
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  markAttendance,
  getAttendance,
} from '@/lib/attendance/queries';
import { withRateLimit, extractClientIp } from '@/lib/security/rateLimiter';
import { logCreate } from '@/lib/security/auditLogger';
import { withTenantContext } from '@/lib/auth/withTenantContext';
import type { UserRole } from '@/types/auth';

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const ALLOWED_STATUSES = [
  'present', 'absent', 'late', 'half_day', 'leave', 'holiday',
] as const;

const markAttendanceSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  checkIn: z.string().datetime().nullable().optional(),
  checkOut: z.string().datetime().nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  selfieUrl: z.string().url().nullable().optional(),
  status: z.enum(ALLOWED_STATUSES).optional().default('present'),
  notes: z.string().max(1000).nullable().optional(),
});

export type MarkAttendanceBody = z.infer<typeof markAttendanceSchema>;

// ---------------------------------------------------------------------------
// GET /api/attendance
// ---------------------------------------------------------------------------

/**
 * GET /api/attendance?date_from=2024-01-01&date_to=2024-01-31
 *
 * Query parameters:
 *   date_from  — Start date (YYYY-MM-DD, required)
 *   date_to    — End date (YYYY-MM-DD, required)
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
    const dateFrom = searchParams.get('date_from');
    const dateTo = searchParams.get('date_to');

    if (!dateFrom || !dateTo) {
      return NextResponse.json(
        { success: false, data: null, error: 'Both date_from and date_to are required', meta: null },
        { status: 400 },
      );
    }

    // Optionally filter by a specific user (tenant_admin or manager can view others)
    const targetUserId = searchParams.get('user_id') || userId;

    // ── Execute ─────────────────────────────────────────────────────────────
    const records = await withTenantContext(
      tenantId,
      userId,
      userRole || 'agent',
      () => getAttendance(tenantId, targetUserId, dateFrom, dateTo),
    );

    return NextResponse.json(
      {
        success: true,
        data: records,
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
    console.error('[api/attendance] GET error:', error);
    return NextResponse.json(
      { success: false, data: null, error: 'Internal server error', meta: null },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/attendance
// ---------------------------------------------------------------------------

/**
 * POST /api/attendance
 *
 * Marks attendance (check-in/out) for the current user.
 * Validates GPS coordinates against office geo-fence radius.
 * Checks selfie URL for reuse (anti-fraud).
 *
 * Body: MarkAttendanceBody (see Zod schema above)
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // ── Auth headers ───────────────────────────────────────────────────────
    const userId = request.headers.get('x-user-id');
    const tenantId = request.headers.get('x-tenant-id');
    const userRole = request.headers.get('x-user-role') as UserRole | null;
    const requestId = request.headers.get('x-session-id') || crypto.randomUUID();
    const clientIp = extractClientIp(request);
    const userAgent = request.headers.get('user-agent') || null;

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

    // ── Parse & validate body ──────────────────────────────────────────────
    const body = await request.json();
    const parsed = markAttendanceSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          data: null,
          error: parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; '),
          meta: null,
        },
        { status: 400 },
      );
    }

    // ── GPS validation ──────────────────────────────────────────────────────
    if (parsed.data.latitude != null && parsed.data.longitude != null) {
      const { validateGpsLocation } = await import('@/lib/attendance/queries');
      const gpsResult = validateGpsLocation(
        parsed.data.latitude,
        parsed.data.longitude,
      );
      if (!gpsResult.withinRange) {
        return NextResponse.json(
          {
            success: false,
            data: null,
            error: `GPS location out of range. You are ${Math.round(gpsResult.distanceMeters)}m from the office (max allowed: 500m).`,
            meta: null,
          },
          { status: 400 },
        );
      }
    }

    // ── Execute ────────────────────────────────────────────────────────────
    const attendance = await withTenantContext(
      tenantId,
      userId,
      userRole || 'agent',
      () => markAttendance(tenantId, userId, {
        date: parsed.data.date,
        checkIn: parsed.data.checkIn ?? null,
        checkOut: parsed.data.checkOut ?? null,
        latitude: parsed.data.latitude ?? null,
        longitude: parsed.data.longitude ?? null,
        selfieUrl: parsed.data.selfieUrl ?? null,
        status: parsed.data.status,
        notes: parsed.data.notes ?? null,
      }),
    );

    // ── Audit log ─────────────────────────────────────────────────────────
    await logCreate(
      'attendance',
      attendance.id,
      {
        date: attendance.date,
        status: attendance.status,
        user_id: userId,
        latitude: parsed.data.latitude,
        longitude: parsed.data.longitude,
      },
      { ipAddress: clientIp, userAgent, requestId },
    );

    return NextResponse.json(
      {
        success: true,
        data: attendance,
        error: null,
        meta: null,
      },
      {
        status: 201,
        headers: {
          ...rateHeaders,
          'X-Request-Id': requestId,
        },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('[api/attendance] POST error:', message);

    // Check for selfie reuse error
    if (message.includes('Selfie image has already been used')) {
      return NextResponse.json(
        { success: false, data: null, error: message, meta: null },
        { status: 409 },
      );
    }

    return NextResponse.json(
      { success: false, data: null, error: 'Internal server error', meta: null },
      { status: 500 },
    );
  }
}
