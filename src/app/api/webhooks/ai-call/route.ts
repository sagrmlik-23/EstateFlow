// ============================================================================
// EstateFlow CRM — AI Call Webhook
// Phase 3 — AI Voice Agent (AGENT-3-1-PROVIDER-ADAPTER)
//
// Generic webhook that receives call events from any AI voice provider
// (Bland AI, Retell AI, Vapi). Routes to the appropriate provider's
// webhook handler, updates the ai_call_queue table, and logs activity.
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import pino from 'pino';

import { withRateLimit } from '@/lib/security/rateLimiter';
import { auditLog } from '@/lib/security/auditLogger';
import { logActivity } from '@/lib/activity/queries';
import type {
  BlandAIWebhookPayload,
  RetellAIWebhookPayload,
  VapiWebhookPayload,
  AIProviderName,
  CallOutcome,
} from '@/types/ai';

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

const logger = pino({
  name: 'webhook:ai-call',
  level: process.env.LOG_LEVEL || 'info',
  transport:
    process.env.NODE_ENV === 'development'
      ? { target: 'pino/file', options: { destination: 1 } }
      : undefined,
});

// ---------------------------------------------------------------------------
// Provider detection
// ---------------------------------------------------------------------------

const PROVIDER_HEADER = 'x-ai-provider';

function detectProvider(
  request: NextRequest,
  body: Record<string, unknown>,
): AIProviderName {
  // 1. Check explicit header
  const headerProvider = request.headers.get(PROVIDER_HEADER);
  if (headerProvider === 'bland_ai') return 'bland_ai';
  if (headerProvider === 'retell_ai') return 'retell_ai';
  if (headerProvider === 'vapi') return 'vapi';

  // 2. Detect by payload shape
  // Bland AI: has 'call_id' at root, no 'event' key
  if (body.call_id && typeof body.call_id === 'string' && !body.event) {
    return 'bland_ai';
  }

  // Retell AI: has 'event' and 'call_id' at root
  if (body.event && body.call_id) {
    return 'retell_ai';
  }

  // Vapi: has 'message' object with 'type'
  const vapiBody = body as VapiWebhookPayload;
  if (vapiBody.message?.type) {
    return 'vapi';
  }

  // 3. Fallback
  logger.warn(
    { bodyKeys: Object.keys(body) },
    'Could not detect provider from payload, defaulting to bland_ai',
  );
  return 'bland_ai';
}

// ---------------------------------------------------------------------------
// Webhook result interface (normalized across providers)
// ---------------------------------------------------------------------------

interface WebhookResult {
  callId: string;
  status: string;
  recordingUrl: string | null;
  transcript: string | null;
  duration?: number;
  sentiment?: string;
  outcome?: CallOutcome | null;
}

// ---------------------------------------------------------------------------
// Provider-specific webhook parsers
// ---------------------------------------------------------------------------

function parseBlandWebhook(payload: BlandAIWebhookPayload): WebhookResult {
  return {
    callId: payload.call_id,
    status: payload.status ?? 'completed',
    transcript: payload.transcript ?? null,
    recordingUrl: payload.recording_url ?? null,
    duration: payload.duration,
    sentiment: payload.sentiment,
    outcome: extractOutcome(payload.status, payload as unknown as Record<string, unknown>),
  };
}

function parseRetellWebhook(payload: RetellAIWebhookPayload): WebhookResult {
  return {
    callId: payload.call_id,
    status: payload.call_status ?? 'completed',
    transcript: payload.transcript ?? null,
    recordingUrl: payload.recording_url ?? null,
    duration: payload.duration_ms ? Math.round(payload.duration_ms / 1000) : undefined,
    sentiment: undefined,
    outcome: null,
  };
}

function parseVapiWebhook(payload: VapiWebhookPayload): WebhookResult {
  const msg = payload.message;
  const callId = msg?.call_id ?? payload.call_id ?? '';
  return {
    callId,
    status: msg?.status ?? payload.status ?? 'completed',
    transcript: msg?.transcript ?? null,
    recordingUrl: msg?.recording_url ?? null,
    duration: msg?.duration_seconds,
    outcome: msg?.ended_reason
      ? extractOutcome(msg.ended_reason, {})
      : null,
  };
}

function extractOutcome(
  statusOrReason: string,
  _data: Record<string, unknown>,
): CallOutcome | null {
  const s = (statusOrReason ?? '').toLowerCase();
  if (s === 'interested' || s === 'converted') return 'interested';
  if (s === 'not_interested') return 'not_interested';
  if (s === 'callback') return 'callback';
  if (s === 'site_visit') return 'site_visit';
  if (s === 'wrong_number') return 'wrong_number';
  if (s === 'no_answer' || s === 'no-answer' || s === 'customer-busy') return 'no_answer';
  return null;
}

// ---------------------------------------------------------------------------
// DB update helpers
// ---------------------------------------------------------------------------

async function updateCallQueue(
  providerCallId: string,
  provider: AIProviderName,
  updates: {
    status?: string;
    recordingUrl?: string | null;
    transcript?: string | null;
    outcome?: CallOutcome | null;
    duration?: number;
    sentiment?: string;
    error?: string | null;
  },
): Promise<{ id: string; tenantId: string; leadId: string | null; agentId: string | null } | null> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    logger.warn('Supabase not configured — DB updates skipped');
    return null;
  }

  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const dbUpdates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (updates.status) {
    dbUpdates.status = updates.status;
    if (['completed', 'failed', 'no_answer', 'busy', 'cancelled'].includes(updates.status)) {
      dbUpdates.ended_at = new Date().toISOString();
    }
  }
  if (updates.recordingUrl !== undefined) dbUpdates.recording_url = updates.recordingUrl;
  if (updates.transcript !== undefined) dbUpdates.transcript = updates.transcript;
  if (updates.outcome !== undefined) dbUpdates.outcome = updates.outcome;
  if (updates.duration !== undefined) dbUpdates.duration_seconds = updates.duration;
  if (updates.sentiment !== undefined) dbUpdates.sentiment = updates.sentiment;
  if (updates.error !== undefined) dbUpdates.error = updates.error;

  const { data, error } = await supabase
    .from('ai_call_queue')
    .update(dbUpdates)
    .eq('provider_call_id', providerCallId)
    .eq('provider', provider)
    .select('id, tenant_id, lead_id, ai_agent_id')
    .single();

  if (error) {
    logger.error({ error, providerCallId, provider }, 'Failed to update ai_call_queue');
    return null;
  }

  if (!data) return null;

  return {
    id: (data as Record<string, unknown>).id as string,
    tenantId: (data as Record<string, unknown>).tenant_id as string,
    leadId: ((data as Record<string, unknown>).lead_id as string) ?? null,
    agentId: ((data as Record<string, unknown>).ai_agent_id as string) ?? null,
  };
}

// ---------------------------------------------------------------------------
// POST /api/webhooks/ai-call
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // ── Rate Limit ────────────────────────────────────────────────────
    const { result: rateLimitResult } = await withRateLimit(request, 'webhook');
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many requests' },
        { status: 429 },
      );
    }

    // ── Parse Body ────────────────────────────────────────────────────
    const body = (await request.json()) as Record<string, unknown>;
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { success: false, error: 'Invalid request body' },
        { status: 400 },
      );
    }

    // ── Detect Provider ──────────────────────────────────────────────
    const providerName = detectProvider(request, body);
    logger.info(
      { provider: providerName, bodyKeys: Object.keys(body) },
      'AI call webhook received',
    );

    // ── Parse Webhook ────────────────────────────────────────────────
    let result: WebhookResult;

    try {
      switch (providerName) {
        case 'bland_ai':
          result = parseBlandWebhook(body as unknown as BlandAIWebhookPayload);
          break;
        case 'retell_ai':
          result = parseRetellWebhook(body as unknown as RetellAIWebhookPayload);
          break;
        case 'vapi':
          result = parseVapiWebhook(body as unknown as VapiWebhookPayload);
          break;
        default: {
          return NextResponse.json(
            { success: false, error: `Unsupported provider: ${providerName}` },
            { status: 400 },
          );
        }
      }
    } catch (parseError) {
      logger.error({ error: parseError, provider: providerName }, 'Failed to parse webhook');
      return NextResponse.json(
        { success: false, error: 'Failed to parse webhook payload' },
        { status: 500 },
      );
    }

    // ── Update ai_call_queue ─────────────────────────────────────────
    const queueRecord = await updateCallQueue(result.callId, providerName, {
      status: result.status,
      recordingUrl: result.recordingUrl,
      transcript: result.transcript,
      outcome: result.outcome ?? undefined,
      duration: result.duration,
      sentiment: result.sentiment,
    });

    if (queueRecord) {
      // Log activity
      await logActivity(
        queueRecord.tenantId,
        null,
        'ai_call_updated',
        queueRecord.id,
        `AI call ${result.callId} updated to status: ${result.status}`,
        'ai_call',
        {
          provider: providerName,
          status: result.status,
          outcome: result.outcome,
          duration: result.duration,
        },
      ).catch(() => {});
    }

    // ── Audit Log ────────────────────────────────────────────────────
    await auditLog({
      tenantId: queueRecord?.tenantId ?? '',
      userId: 'webhook:ai-call',
      action: 'update',
      entityType: 'ai_call',
      entityId: queueRecord?.id ?? result.callId,
      oldValues: null,
      newValues: {
        provider: providerName,
        status: result.status,
        outcome: result.outcome,
        duration: result.duration,
        callId: result.callId,
      },
      ipAddress: request.headers.get('x-forwarded-for') ?? null,
      userAgent: request.headers.get('user-agent') ?? null,
      requestId: crypto.randomUUID(),
    }).catch(() => {});

    // ── Response ─────────────────────────────────────────────────────
    return NextResponse.json(
      {
        success: true,
        data: {
          callId: result.callId,
          status: result.status,
          outcome: result.outcome,
          recordingUrl: result.recordingUrl,
          duration: result.duration,
          message: 'Webhook processed successfully',
        },
      },
      { status: 200 },
    );
  } catch (error) {
    logger.error({ error }, 'Unhandled error in AI call webhook');
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// GET /api/webhooks/ai-call — Health check / verification
// ---------------------------------------------------------------------------

export async function GET(_request: NextRequest): Promise<NextResponse> {
  return NextResponse.json(
    {
      success: true,
      data: {
        message: 'AI call webhook endpoint is active',
        version: '1.0.0',
        supportedProviders: ['bland_ai', 'retell_ai', 'vapi'],
      },
    },
    { status: 200 },
  );
}
