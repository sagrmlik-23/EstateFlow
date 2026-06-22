// ============================================================================
// EstateFlow CRM — Lead Statistics API
// GET /api/leads/stats — Aggregated lead counts
// Agent-2-1-API-Leads v1.0.0
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { getLeadStats, type LeadFilters } from '@/lib/leads/queries';
import { withRateLimit } from '@/lib/security/rateLimiter';
import { auditLog } from '@/lib/security/auditLogger';
import { withTenantContext } from '@/lib/auth/withTenantContext';
import type { UserRole } from '@/types/auth';

// ---------------------------------------------------------------------------
// GET /api/leads/stats
// ---------------------------------------------------------------------------

/**
 * GET /api/leads/stats
 *
 * Returns aggregated lead statistics for the current tenant.
 *
 * Query parameters (all optional):
 *   created_after    — ISO date string (inclusive)
 *   created_before   — ISO date string (inclusive)
 *   source           — Filter by source
 *   assigned_agent_id — Filter by assigned agent
 *   property_type    — Filter by property type
 *
 * Response:
 * {
 *   success: true,
 *   data: {
 *     total: number,
 *     by_status: Record<string, number>,
 *     by_source: Record<string, number>,
 *     by_score_range: { low: number, medium: number, high: number, unassigned: number }
 *   },
 *   error: null,
 *   meta: null
 * }
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // ── Auth headers ───────────────────────────────────────────────────────
    const userId = request.headers.get('x-user-id');
    const tenantId = request.headers.get('x-tenant-id');
    const userRole = request.headers.get('x-user-role') as UserRole | null;
    const requestId = request.headers.get('x-session-id') || crypto.randomUUID();
    const clientIp = request.headers.get('x-forwarded-for') || '127.0.0.1';
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

    // ── Parse optional filters ─────────────────────────────────────────────
    const { searchParams } = request.nextUrl;
    const filters: LeadFilters = {};

    if (searchParams.get('created_after')) {
      filters.created_after = searchParams.get('created_after')!;
    }
    if (searchParams.get('created_before')) {
      filters.created_before = searchParams.get('created_before')!;
    }
    if (searchParams.get('source')) {
      filters.source = searchParams.get('source')!;
    }
    if (searchParams.get('assigned_agent_id')) {
      filters.assigned_agent_id = searchParams.get('assigned_agent_id')!;
    }
    if (searchParams.get('property_type')) {
      filters.property_type = searchParams.get('property_type')!;
    }

    // ── Execute ────────────────────────────────────────────────────────────
    const stats = await withTenantContext(
      tenantId,
      userId,
      userRole || 'agent',
      () => getLeadStats(tenantId, filters),
    );

    // ── Audit log (view action for stats) ─────────────────────────────────
    await auditLog({
      action: 'view',
      entityType: 'lead_stats',
      entityId: tenantId,
      oldValues: null,
      newValues: { filters },
      ipAddress: clientIp,
      userAgent,
      requestId,
      tenantId,
      userId,
    });

    return NextResponse.json(
      {
        success: true,
        data: stats,
        error: null,
        meta: null,
      },
      {
        status: 200,
        headers: { ...rateHeaders, 'X-Request-Id': requestId },
      },
    );
  } catch (error) {
    console.error('[api/leads/stats] GET error:', error);
    return NextResponse.json(
      { success: false, data: null, error: 'Internal server error', meta: null },
      { status: 500 },
    );
  }
}
