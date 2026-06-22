// ============================================================================
// EstateFlow CRM — Site Visits API
// POST  /api/calendar/site-visits  — Schedule a new site visit
// GET   /api/calendar/site-visits  — List site visits with filters
// Agent-6-1-Attendance-Calendar v1.0.0
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  getSiteVisits,
  createSiteVisit,
} from '@/lib/calendar/queries';
import { withRateLimit, extractClientIp } from '@/lib/security/rateLimiter';
import { logCreate } from '@/lib/security/auditLogger';
import { withTenantContext } from '@/lib/auth/withTenantContext';
import type { UserRole } from '@/types/auth';

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const ALLOWED_VISIT_STATUSES = [
  'scheduled', 'completed', 'cancelled', 'rescheduled', 'no_show',
] as const;

const createSiteVisitSchema = z.object({
  leadId: z.string().uuid('Lead ID must be a valid UUID'),
  propertyId: z.string().uuid('Property ID must be a valid UUID'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  time: z.string().min(1, 'Time is required'),
  agentId: z.string().uuid().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export type CreateSiteVisitBody = z.infer<typeof createSiteVisitSchema>;

// ---------------------------------------------------------------------------
// GET /api/calendar/site-visits
// ---------------------------------------------------------------------------

/**
 * GET /api/calendar/site-visits?date_from=2024-01-01&date_to=2024-01-31&agent_id=<uuid>
 *
 * Query parameters:
 *   date_from  — Start date (YYYY-MM-DD, required)
 *   date_to    — End date (YYYY-MM-DD, required)
 *   agent_id   — Filter by agent UUID (optional)
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
    const agentId = searchParams.get('agent_id') || null;

    if (!dateFrom || !dateTo) {
      return NextResponse.json(
        { success: false, data: null, error: 'Both date_from and date_to are required', meta: null },
        { status: 400 },
      );
    }

    // ── Execute ─────────────────────────────────────────────────────────────
    const visits = await withTenantContext(
      tenantId,
      userId,
      userRole || 'agent',
      () => getSiteVisits(tenantId, dateFrom, dateTo, agentId),
    );

    return NextResponse.json(
      {
        success: true,
        data: visits,
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
    console.error('[api/calendar/site-visits] GET error:', error);
    return NextResponse.json(
      { success: false, data: null, error: 'Internal server error', meta: null },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/calendar/site-visits
// ---------------------------------------------------------------------------

/**
 * POST /api/calendar/site-visits
 *
 * Schedule a new site visit for a lead at a property.
 *
 * Body: CreateSiteVisitBody (see Zod schema above)
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
    const parsed = createSiteVisitSchema.safeParse(body);

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

    // ── Execute ────────────────────────────────────────────────────────────
    const visit = await withTenantContext(
      tenantId,
      userId,
      userRole || 'agent',
      () => createSiteVisit(
        parsed.data.leadId,
        parsed.data.propertyId,
        parsed.data.date,
        parsed.data.time,
        parsed.data.agentId || userId,
        parsed.data.notes ?? null,
      ),
    );

    // ── Audit log ─────────────────────────────────────────────────────────
    await logCreate(
      'site_visit',
      visit.id,
      {
        lead_id: parsed.data.leadId,
        property_id: parsed.data.propertyId,
        scheduled_at: visit.scheduled_at,
        status: visit.status,
        scheduled_by: parsed.data.agentId || userId,
      },
      { ipAddress: clientIp, userAgent, requestId },
    );

    return NextResponse.json(
      {
        success: true,
        data: visit,
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
    console.error('[api/calendar/site-visits] POST error:', error);
    return NextResponse.json(
      { success: false, data: null, error: 'Internal server error', meta: null },
      { status: 500 },
    );
  }
}
