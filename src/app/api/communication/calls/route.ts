// ============================================================================
// EstateFlow CRM — Voice Calls API
// POST /api/communication/calls — Initiate a voice call
// GET  /api/communication/calls — Call history with filters
// Phase 4 — Voice Adapter (AGENT-4-1-VOICE-ADAPTER)
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import pino from 'pino';

import { buildPaginationParams } from '@/lib/types';
import { getVoiceProvider } from '@/lib/communication/providerFactory';
import { withRateLimit, extractClientIp } from '@/lib/security/rateLimiter';
import { logCreate } from '@/lib/security/auditLogger';
import type { CallParams } from '@/types/communication';

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

const logger = pino({
  name: 'api:communication:calls',
  level: process.env.LOG_LEVEL || 'info',
  transport:
    process.env.NODE_ENV === 'development'
      ? { target: 'pino/file', options: { destination: 1 } }
      : undefined,
});

// ---------------------------------------------------------------------------
// Zod Schemas
// ---------------------------------------------------------------------------

const initiateCallSchema = z.object({
  to: z.string().min(5, 'Destination phone number is required'),
  from: z.string().optional(),
  lead_id: z.string().uuid('lead_id must be a valid UUID').optional(),
  agent_id: z.string().uuid('agent_id must be a valid UUID').optional(),
  call_type: z.string().optional(),
  twiml: z.string().optional(),
  url: z.string().url('url must be a valid URL').optional(),
  record: z.boolean().optional().default(true),
  dry_run: z.boolean().optional(),
});

const ALLOWED_STATUSES = [
  'queued', 'ringing', 'in_progress', 'completed',
  'failed', 'no_answer', 'busy', 'cancelled', 'missed',
] as const;

// ---------------------------------------------------------------------------
// GET /api/communication/calls
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
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

    // ── Parse query params ──────────────────────────────────────────────────
    const { searchParams } = request.nextUrl;
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const pagination = buildPaginationParams(page, limit);

    // ── Build filters ──────────────────────────────────────────────────────
    const filters: {
      status?: string;
      leadId?: string;
      agentId?: string;
      direction?: string;
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

    const leadId = searchParams.get('lead_id');
    if (leadId) filters.leadId = leadId;

    const agentId = searchParams.get('agent_id');
    if (agentId) filters.agentId = agentId;

    const direction = searchParams.get('direction');
    if (direction) {
      if (!['inbound', 'outbound'].includes(direction)) {
        return NextResponse.json(
          { success: false, data: null, error: 'Invalid direction. Allowed: inbound, outbound', meta: null },
          { status: 400 },
        );
      }
      filters.direction = direction;
    }

    const createdAfter = searchParams.get('created_after');
    if (createdAfter) {
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

    // ── Fetch call history from DB ─────────────────────────────────────────
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

    let query = supabase
      .from('calls')
      .select('*', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .range(pagination.offset, pagination.offset + pagination.limit - 1);

    if (filters.status) query = query.eq('status', filters.status);
    if (filters.leadId) query = query.eq('lead_id', filters.leadId);
    if (filters.agentId) query = query.eq('agent_id', filters.agentId);
    if (filters.direction) query = query.eq('direction', filters.direction);
    if (filters.createdAfter) query = query.gte('created_at', filters.createdAfter);
    if (filters.createdBefore) query = query.lte('created_at', filters.createdBefore);

    const { data, error, count } = await query;

    if (error) {
      logger.error({ error }, 'Failed to fetch call history');
      return NextResponse.json(
        { success: false, data: null, error: 'Failed to fetch call history', meta: null },
        { status: 500 },
      );
    }

    const total = count ?? 0;

    return NextResponse.json(
      {
        success: true,
        data: data ?? [],
        error: null,
        meta: {
          page: pagination.page,
          limit: pagination.limit,
          total,
          total_pages: Math.ceil(total / pagination.limit),
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
    logger.error({ error }, '[api/communication/calls] GET error');
    return NextResponse.json(
      { success: false, data: null, error: 'Internal server error', meta: null },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/communication/calls
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  const requestId = request.headers.get('x-session-id') || crypto.randomUUID();

  try {
    // ── Auth headers ───────────────────────────────────────────────────────
    const userId = request.headers.get('x-user-id');
    const tenantId = request.headers.get('x-tenant-id');
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
    const parsed = initiateCallSchema.safeParse(body);

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

    const { to, from, lead_id, agent_id, call_type, twiml, url, record, dry_run } = parsed.data;

    // ── Get the voice provider for this tenant ─────────────────────────────
    // Fetch tenant feature flags (in a real setup, this would be cached)
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
    let featureFlags: Record<string, unknown> | undefined;
    let tenantRegion: string | undefined;

    if (supabaseUrl && supabaseKey) {
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(supabaseUrl, supabaseKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      const { data: tenant } = await supabase
        .from('tenants')
        .select('feature_flags, region')
        .eq('id', tenantId)
        .single();

      if (tenant) {
        featureFlags = (tenant as Record<string, unknown>).feature_flags as Record<string, unknown> ?? {};
        tenantRegion = (tenant as Record<string, unknown>).region as string | undefined;
      }
    }

    // Override dry_run if explicitly requested
    if (dry_run && featureFlags) {
      featureFlags = { ...featureFlags, dryRunEnabled: true };
    }

    // ── Initiate the call ──────────────────────────────────────────────────
    const provider = getVoiceProvider(tenantId, tenantRegion, to, featureFlags);

    const callParams: CallParams = {
      to,
      from: from || '',
      tenantId,
      leadId: lead_id,
      agentId: agent_id,
      callType: call_type,
      twiml,
      url,
      record,
    };

    const result = await provider.makeCall(callParams);

    // ── Save to calls table ────────────────────────────────────────────────
    if (supabaseUrl && supabaseKey) {
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(supabaseUrl, supabaseKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      const { error: insertError } = await supabase.from('calls').insert({
        tenant_id: tenantId,
        lead_id: lead_id || null,
        agent_id: agent_id || userId,
        caller_phone: from || null,
        callee_phone: to,
        direction: 'outbound',
        status: result.status,
        provider: provider.name,
        provider_call_sid: result.callSid,
        duration_seconds: result.duration || null,
        created_at: new Date().toISOString(),
      });

      if (insertError) {
        logger.error({ error: insertError }, 'Failed to save call record');
      }
    }

    // ── Audit log ─────────────────────────────────────────────────────────
    await logCreate(
      'call',
      result.callSid,
      {
        tenant_id: tenantId,
        to,
        from: from || '',
        lead_id: lead_id || null,
        agent_id: agent_id || userId,
        provider: provider.name,
        dry_run: dry_run || false,
        initiated_by: userId,
      },
      { ipAddress: clientIp, userAgent, requestId },
    );

    return NextResponse.json(
      {
        success: true,
        data: {
          call_sid: result.callSid,
          status: result.status,
          duration: result.duration,
          price: result.price,
          provider: result.provider,
          message: result.message || 'Call initiated',
          dry_run: dry_run || false,
        },
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
    logger.error({ error }, '[api/communication/calls] POST error');
    return NextResponse.json(
      { success: false, data: null, error: error instanceof Error ? error.message : 'Internal server error', meta: null },
      { status: 500 },
    );
  }
}
