// ============================================================================
// EstateFlow CRM — AI Call Analytics API
// GET /api/ai/analytics — Aggregated analytics with date range & agent filter
// Phase 3 — AI Voice Agent (AGENT-3-4-ANALYTICS-INSIGHTS)
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import {
  getCallAnalytics,
  getAgentAnalytics,
} from '@/lib/ai/callAnalytics';
import { withRateLimit } from '@/lib/security/rateLimiter';
import { withTenantContext } from '@/lib/auth/withTenantContext';
import type { UserRole } from '@/types/auth';

// ---------------------------------------------------------------------------
// GET /api/ai/analytics
// ---------------------------------------------------------------------------

/**
 * GET /api/ai/analytics
 *
 * Query parameters:
 *   date_from  — ISO date string (default: 30 days ago)
 *   date_to    — ISO date string (default: today)
 *   agent_id   — Filter by specific AI agent UUID (optional)
 *   group_by   — 'agent' to get per-agent breakdown (default: aggregated)
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

    // Default date range: last 30 days
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

    const agentId = searchParams.get('agent_id');
    const groupBy = searchParams.get('group_by');

    // ── Execute ────────────────────────────────────────────────────────────
    const result = await withTenantContext(
      tenantId,
      userId,
      userRole || 'agent',
      async () => {
        if (agentId) {
          // If a specific agent is requested, return per-agent breakdown for just that agent
          const agentResults = await getAgentAnalytics(tenantId, dateFrom, dateTo);
          return {
            analytics: agentResults.filter((a) => a.agentId === agentId),
            type: 'agent',
          };
        }

        if (groupBy === 'agent') {
          // Per-agent breakdown
          const agentResults = await getAgentAnalytics(tenantId, dateFrom, dateTo);
          return {
            analytics: agentResults,
            type: 'agent',
          };
        }

        // Default: aggregated analytics
        const aggregated = await getCallAnalytics(tenantId, dateFrom, dateTo);
        return {
          analytics: aggregated,
          type: 'aggregated',
        };
      },
    );

    return NextResponse.json(
      {
        success: true,
        data: result.analytics,
        error: null,
        meta: {
          type: result.type,
          dateFrom,
          dateTo,
          agentFilter: agentId || null,
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
    console.error('[api/ai/analytics] GET error:', error);
    return NextResponse.json(
      { success: false, data: null, error: 'Internal server error', meta: null },
      { status: 500 },
    );
  }
}
