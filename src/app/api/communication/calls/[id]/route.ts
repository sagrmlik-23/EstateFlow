// ============================================================================
// EstateFlow CRM — Single Voice Call Detail API
// GET /api/communication/calls/[id] — Single call details
// Phase 4 — Voice Adapter (AGENT-4-1-VOICE-ADAPTER)
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import pino from 'pino';

import { withRateLimit } from '@/lib/security/rateLimiter';

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

const logger = pino({
  name: 'api:communication:calls:id',
  level: process.env.LOG_LEVEL || 'info',
  transport:
    process.env.NODE_ENV === 'development'
      ? { target: 'pino/file', options: { destination: 1 } }
      : undefined,
});

// ---------------------------------------------------------------------------
// Route params interface (Next.js 15 App Router pattern)
// ---------------------------------------------------------------------------

interface RouteParams {
  params: Promise<{ id: string }>;
}

// ---------------------------------------------------------------------------
// GET /api/communication/calls/[id]
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  const requestId = request.headers.get('x-session-id') || crypto.randomUUID();

  try {
    // ── Auth headers ───────────────────────────────────────────────────────
    const userId = request.headers.get('x-user-id');
    const tenantId = request.headers.get('x-tenant-id');
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

    if (!id || typeof id !== 'string') {
      return NextResponse.json(
        { success: false, data: null, error: 'Invalid call ID', meta: null },
        { status: 400 },
      );
    }

    // ── Fetch call from DB ─────────────────────────────────────────────────
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { success: false, data: null, error: 'Database not configured', meta: null },
        { status: 500 },
      );
    }

    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: call, error } = await supabase
      .from('calls')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // not found
        return NextResponse.json(
          { success: false, data: null, error: 'Call not found', meta: null },
          { status: 404 },
        );
      }
      logger.error({ error, callId: id }, 'Failed to fetch call');
      return NextResponse.json(
        { success: false, data: null, error: 'Failed to fetch call', meta: null },
        { status: 500 },
      );
    }

    if (!call) {
      return NextResponse.json(
        { success: false, data: null, error: 'Call not found', meta: null },
        { status: 404 },
      );
    }

    // ── Tenant isolation ───────────────────────────────────────────────────
    const callRecord = call as Record<string, unknown>;
    if (callRecord.tenant_id !== tenantId) {
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
    logger.error({ error }, '[api/communication/calls/[id]] GET error');
    return NextResponse.json(
      { success: false, data: null, error: 'Internal server error', meta: null },
      { status: 500 },
    );
  }
}
