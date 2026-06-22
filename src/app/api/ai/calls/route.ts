// ============================================================================
// EstateFlow CRM — AI Calls API (List/History)
// GET /api/ai/calls — Paginated call history with filters
// Phase 3 — AI Voice Agent
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { buildPaginationParams } from '@/lib/types';
import { getCallHistory, getCallById } from '@/lib/ai/callQueue';
import { withRateLimit, extractClientIp } from '@/lib/security/rateLimiter';
import type { UserRole } from '@/types/auth';

// ---------------------------------------------------------------------------
// Allowed filter values
// ---------------------------------------------------------------------------

const ALLOWED_STATUSES = [
  'queued', 'ringing', 'in_progress', 'completed', 'failed',
  'no_answer', 'busy', 'cancelled',
] as const;

const ALLOWED_OUTCOMES = [
  'converted', 'interested', 'not_interested', 'callback', 'wrong_number',
] as const;

// ---------------------------------------------------------------------------
// GET /api/ai/calls
// ---------------------------------------------------------------------------

/**
 * GET /api/ai/calls
 *
 * Query parameters:
 *   page, limit         — Pagination (default: 1, 20)
 *   status              — Filter by call status
 *   agent_id            — Filter by AI agent UUID
 *   lead_id             — Filter by lead UUID
 *   outcome             — Filter by call outcome
 *   created_after       — ISO date string (inclusive)
 *   created_before      — ISO date string (inclusive)
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
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const pagination = buildPaginationParams(page, limit);

    // ── Build filters ──────────────────────────────────────────────────────
    const filters: {
      status?: string;
      agentId?: string;
      leadId?: string;
      outcome?: string;
      createdAfter?: string;
      createdBefore?: string;
    } = {};

    const status = searchParams.get('status');
    if (status) {
      if (!(ALLOWED_STATUSES as readonly string[]).includes(status)) {
        return NextResponse.json(
          { success: false, data: null, error: `Invalid status. Allowed: ${ALLOWED_STATUSES.join(', ')}`, meta: null },
          { status: 400 },
        );
      }
      filters.status = status;
    }

    const agentId = searchParams.get('agent_id');
    if (agentId) filters.agentId = agentId;

    const leadId = searchParams.get('lead_id');
    if (leadId) filters.leadId = leadId;

    const outcome = searchParams.get('outcome');
    if (outcome) {
      if (!(ALLOWED_OUTCOMES as readonly string[]).includes(outcome)) {
        return NextResponse.json(
          { success: false, data: null, error: `Invalid outcome. Allowed: ${ALLOWED_OUTCOMES.join(', ')}`, meta: null },
          { status: 400 },
        );
      }
      filters.outcome = outcome;
    }

    const createdAfter = searchParams.get('created_after');
    if (createdAfter) {
      // Validate ISO date
      if (isNaN(Date.parse(createdAfter))) {
        return NextResponse.json(
          { success: false, data: null, error: 'Invalid created_after date format. Use ISO 8601.', meta: null },
          { status: 400 },
        );
      }
      filters.createdAfter = createdAfter;
    }

    const createdBefore = searchParams.get('created_before');
    if (createdBefore) {
      if (isNaN(Date.parse(createdBefore))) {
        return NextResponse.json(
          { success: false, data: null, error: 'Invalid created_before date format. Use ISO 8601.', meta: null },
          { status: 400 },
        );
      }
      filters.createdBefore = createdBefore;
    }

    // ── Execute ────────────────────────────────────────────────────────────
    const result = await getCallHistory(tenantId, filters, pagination);

    return NextResponse.json(
      {
        success: true,
        data: result.data,
        error: null,
        meta: result.meta,
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
    console.error('[api/ai/calls] GET error:', error);
    return NextResponse.json(
      { success: false, data: null, error: 'Internal server error', meta: null },
      { status: 500 },
    );
  }
}
