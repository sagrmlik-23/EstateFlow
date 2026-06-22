// ============================================================================
// EstateFlow CRM — Single Site Visit API
// GET   /api/calendar/site-visits/[id]  — Get visit details
// PATCH /api/calendar/site-visits/[id]  — Reschedule/Cancel visit
// Agent-6-1-Attendance-Calendar v1.0.0
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  getVisitById,
  updateSiteVisit,
} from '@/lib/calendar/queries';
import { withRateLimit, extractClientIp } from '@/lib/security/rateLimiter';
import { logUpdate, logDelete } from '@/lib/security/auditLogger';
import { withTenantContext } from '@/lib/auth/withTenantContext';
import type { UserRole } from '@/types/auth';

// ---------------------------------------------------------------------------
// Zod schema for PATCH
// ---------------------------------------------------------------------------

const ALLOWED_VISIT_STATUSES = [
  'scheduled', 'completed', 'cancelled', 'rescheduled', 'no_show',
] as const;

const updateSiteVisitSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional(),
  time: z.string().min(1, 'Time is required').optional(),
  status: z.enum(ALLOWED_VISIT_STATUSES).optional(),
  notes: z.string().max(2000).nullable().optional(),
  feedback: z.string().max(5000).nullable().optional(),
  scheduled_at: z.string().datetime().optional(),
});

export type UpdateSiteVisitBody = z.infer<typeof updateSiteVisitSchema>;

// ---------------------------------------------------------------------------
// GET /api/calendar/site-visits/[id]
// ---------------------------------------------------------------------------

/**
 * GET /api/calendar/site-visits/[id]
 *
 * Returns full details of a single site visit, including lead name/phone,
 * property title/location, and agent name.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
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

    // ── Resolve params ──────────────────────────────────────────────────────
    const { id } = await params;

    // ── Execute ─────────────────────────────────────────────────────────────
    const visit = await withTenantContext(
      tenantId,
      userId,
      userRole || 'agent',
      () => getVisitById(id),
    );

    if (!visit) {
      return NextResponse.json(
        { success: false, data: null, error: 'Site visit not found', meta: null },
        { status: 404 },
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: visit,
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
    console.error('[api/calendar/site-visits/[id]] GET error:', error);
    return NextResponse.json(
      { success: false, data: null, error: 'Internal server error', meta: null },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/calendar/site-visits/[id]
// ---------------------------------------------------------------------------

/**
 * PATCH /api/calendar/site-visits/[id]
 *
 * Update a site visit — used for rescheduling or changing status.
 *
 * Body (partial):
 *   date          — New date (YYYY-MM-DD)
 *   time          — New time (HH:mm or ISO datetime)
 *   status        — New status (scheduled, completed, cancelled, rescheduled, no_show)
 *   notes         — Updated notes
 *   feedback      — Visit feedback (for completed visits)
 *   scheduled_at  — Full ISO datetime override (alternative to date + time)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
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

    // ── Resolve params ──────────────────────────────────────────────────────
    const { id } = await params;

    // ── Parse & validate body ──────────────────────────────────────────────
    const body = await request.json();
    const parsed = updateSiteVisitSchema.safeParse(body);

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

    // ── Fetch existing visit for audit ─────────────────────────────────────
    const existing = await withTenantContext(
      tenantId,
      userId,
      userRole || 'agent',
      () => getVisitById(id),
    );

    if (!existing) {
      return NextResponse.json(
        { success: false, data: null, error: 'Site visit not found', meta: null },
        { status: 404 },
      );
    }

    // ── Execute update ─────────────────────────────────────────────────────
    const updated = await withTenantContext(
      tenantId,
      userId,
      userRole || 'agent',
      () => updateSiteVisit(id, parsed.data),
    );

    // ── Audit log ─────────────────────────────────────────────────────────
    const isCancel = parsed.data.status === 'cancelled' || parsed.data.status === 'no_show';

    if (isCancel) {
      await logDelete(
        'site_visit',
        id,
        {
          status: existing.status,
          scheduled_at: existing.scheduled_at,
          lead_id: existing.lead_id,
          property_id: existing.property_id,
        },
        { ipAddress: clientIp, userAgent, requestId },
      );
    } else {
      await logUpdate(
        'site_visit',
        id,
        {
          status: existing.status,
          scheduled_at: existing.scheduled_at,
        },
        {
          status: updated.status,
          scheduled_at: updated.scheduled_at,
        },
        { ipAddress: clientIp, userAgent, requestId },
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: updated,
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
    console.error('[api/calendar/site-visits/[id]] PATCH error:', error);
    return NextResponse.json(
      { success: false, data: null, error: 'Internal server error', meta: null },
      { status: 500 },
    );
  }
}
