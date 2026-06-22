// ============================================================================
// EstateFlow CRM — AI Call Detail & Manual Trigger API
// GET    /api/ai/calls/[id]   — Single call details with transcript
// POST   /api/ai/calls/[id]   — Trigger a manual AI call for a lead
// Phase 3 — AI Voice Agent
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getCallById, queueCall } from '@/lib/ai/callQueue';
import { AIVoiceOrchestrator } from '@/lib/ai/orchestrator';
import { withRateLimit, extractClientIp } from '@/lib/security/rateLimiter';
import { logCreate } from '@/lib/security/auditLogger';
import type { UserRole } from '@/types/auth';

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const triggerCallSchema = z.object({
  lead_id: z.string().uuid('lead_id must be a valid UUID'),
});

// ---------------------------------------------------------------------------
// Route params interface
// ---------------------------------------------------------------------------

interface RouteParams {
  params: Promise<{ id: string }>;
}

// ---------------------------------------------------------------------------
// GET /api/ai/calls/[id]
// ---------------------------------------------------------------------------

/**
 * GET /api/ai/calls/[id]
 *
 * Returns full call details including transcript, recording, sentiment, etc.
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams,
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

    // ── Resolve call ID ────────────────────────────────────────────────────
    const { id } = await params;

    // ── Fetch call ─────────────────────────────────────────────────────────
    const call = await getCallById(id);

    if (!call) {
      return NextResponse.json(
        { success: false, data: null, error: 'Call not found', meta: null },
        { status: 404 },
      );
    }

    // ── Tenant isolation ───────────────────────────────────────────────────
    if (call.tenant_id !== tenantId) {
      return NextResponse.json(
        { success: false, data: null, error: 'Call not found in this tenant', meta: null },
        { status: 404 },
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: call,
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
    console.error('[api/ai/calls/[id]] GET error:', error);
    return NextResponse.json(
      { success: false, data: null, error: 'Internal server error', meta: null },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/ai/calls/[id]
// ---------------------------------------------------------------------------

/**
 * POST /api/ai/calls/[id]
 *
 * Triggers a manual AI call for a lead.
 * The [id] parameter is the lead_id when triggering a new call.
 *
 * Body: { lead_id: string }
 */
export async function POST(
  request: NextRequest,
  { params }: RouteParams,
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

    // ── Parse & validate body ──────────────────────────────────────────────
    const body = await request.json();
    const parsed = triggerCallSchema.safeParse(body);

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

    const { lead_id } = parsed.data;

    // ── Trigger AI call via orchestrator ───────────────────────────────────
    const orchestrator = new AIVoiceOrchestrator();
    const result = await orchestrator.processNewLead(lead_id);

    if (!result) {
      return NextResponse.json(
        {
          success: false,
          data: null,
          error: 'AI call could not be scheduled. Check that AI voice is enabled, lead has a phone number, and an active agent is configured.',
          meta: null,
        },
        { status: 400 },
      );
    }

    // ── Audit log ─────────────────────────────────────────────────────────
    await logCreate(
      'ai_call',
      result.callId,
      {
        lead_id,
        tenant_id: tenantId,
        triggered_by: userId,
        source: 'manual',
      },
      { ipAddress: clientIp, userAgent, requestId },
    );

    return NextResponse.json(
      {
        success: true,
        data: { call_id: result.callId },
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
    console.error('[api/ai/calls/[id]] POST error:', error);
    return NextResponse.json(
      { success: false, data: null, error: 'Internal server error', meta: null },
      { status: 500 },
    );
  }
}
