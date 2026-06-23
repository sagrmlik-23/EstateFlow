// ============================================================================
// EstateFlow CRM — Voice Call Webhook Handler
// Phase 4 — Voice Adapter (AGENT-4-1-VOICE-ADAPTER)
//
// Receives Exotel/Twilio call status callbacks, recordings, and
// transcription updates. Updates the calls table accordingly.
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import pino from 'pino';

import { withRateLimit } from '@/lib/security/rateLimiter';
import { auditLog } from '@/lib/security/auditLogger';
import { logActivity } from '@/lib/activity/queries';
import type {
  WebhookResult,
} from '@/types/communication';

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

const logger = pino({
  name: 'webhook:voice',
  level: process.env.LOG_LEVEL || 'info',
  transport:
    process.env.NODE_ENV === 'development'
      ? { target: 'pino/file', options: { destination: 1 } }
      : undefined,
});

// ---------------------------------------------------------------------------
// Provider Detection
// ---------------------------------------------------------------------------

const PROVIDER_HEADER = 'x-voice-provider';

function detectProvider(
  request: NextRequest,
  body: Record<string, unknown>,
): 'exotel' | 'twilio' {
  // 1. Check explicit header
  const headerProvider = request.headers.get(PROVIDER_HEADER);
  if (headerProvider === 'exotel') return 'exotel';
  if (headerProvider === 'twilio') return 'twilio';

  // 2. Detect by payload shape
  // Exotel: has 'CallSid' (camelCase)
  if (body.CallSid && !body.AccountSid) {
    return 'exotel';
  }

  // Twilio: has 'AccountSid' and 'CallSid'
  if (body.AccountSid && body.CallSid) {
    return 'twilio';
  }

  // 3. Check user-agent
  const ua = (request.headers.get('user-agent') || '').toLowerCase();
  if (ua.includes('twilio')) return 'twilio';
  if (ua.includes('exotel')) return 'exotel';

  // 4. Default to twilio
  logger.warn(
    { bodyKeys: Object.keys(body) },
    'Could not detect voice provider from payload, defaulting to twilio',
  );
  return 'twilio';
}

// ---------------------------------------------------------------------------
// Webhook Parser (normalised to WebhookResult)
// ---------------------------------------------------------------------------

function parseExotelWebhook(payload: Record<string, unknown>): WebhookResult {
  return {
    callSid: (payload.CallSid || payload.call_sid || '') as string,
    status: mapCallStatus((payload.Status || payload.status || payload.CallStatus || '') as string),
    recordingUrl: (payload.RecordingUrl || payload.recording_url || null) as string | null,
    duration: parseInt((payload.Duration || payload.duration || '0') as string, 10) || undefined,
    price: parseFloat((payload.Price || payload.price || '0') as string) || undefined,
    direction: (payload.Direction || payload.direction || 'outbound') as 'inbound' | 'outbound',
    from: (payload.From || payload.from || '') as string,
    to: (payload.To || payload.to || '') as string,
    error: (payload.ErrorMessage || payload.error_message || null) as string | null,
  };
}

function parseTwilioWebhook(payload: Record<string, unknown>): WebhookResult {
  return {
    callSid: (payload.CallSid || '') as string,
    status: mapCallStatus((payload.CallStatus || payload.call_status || '') as string),
    recordingUrl: (payload.RecordingUrl || payload.recording_url || null) as string | null,
    duration: parseInt((payload.CallDuration || payload.duration || '0') as string, 10) || undefined,
    price: parseFloat((payload.CallPrice || payload.price || '0') as string) || undefined,
    direction: (payload.Direction || payload.direction || 'outbound') as 'inbound' | 'outbound',
    from: (payload.From || payload.from || '') as string,
    to: (payload.To || payload.to || '') as string,
    transcription: (payload.TranscriptionText || payload.transcription_text || null) as string | null,
    error: (payload.ErrorCode || payload.error_code || null) as string | null,
  };
}

function mapCallStatus(raw: string): string {
  const statusMap: Record<string, string> = {
    queued: 'queued',
    ringing: 'ringing',
    'in-progress': 'in_progress',
    completed: 'completed',
    failed: 'failed',
    busy: 'busy',
    'no-answer': 'no_answer',
    cancelled: 'cancelled',
    missed: 'missed',
  };
  return statusMap[raw?.toLowerCase()] ?? raw ?? 'unknown';
}

// ---------------------------------------------------------------------------
// DB Update
// ---------------------------------------------------------------------------

async function updateCallRecord(
  providerCallSid: string,
  provider: string,
  updates: {
    status?: string;
    recordingUrl?: string | null;
    duration?: number;
    price?: number;
    transcription?: string | null;
    error?: string | null;
  },
): Promise<{ id: string; tenantId: string; leadId: string | null; agentId: string | null } | null> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;

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
  }
  if (updates.recordingUrl !== undefined) dbUpdates.recording_url = updates.recordingUrl;
  if (updates.duration !== undefined) dbUpdates.duration_seconds = updates.duration;
  if (updates.price !== undefined) dbUpdates.price = updates.price;
  if (updates.transcription !== undefined) dbUpdates.notes = updates.transcription;
  if (updates.error !== undefined) dbUpdates.notes = updates.error;

  const { data, error } = await supabase
    .from('calls')
    .update(dbUpdates)
    .eq('provider_call_sid', providerCallSid)
    .select('id, tenant_id, lead_id, agent_id')
    .single();

  if (error) {
    logger.error({ error, providerCallSid, provider }, 'Failed to update calls table');
    return null;
  }

  if (!data) return null;

  return {
    id: (data as Record<string, unknown>).id as string,
    tenantId: (data as Record<string, unknown>).tenant_id as string,
    leadId: ((data as Record<string, unknown>).lead_id as string) ?? null,
    agentId: ((data as Record<string, unknown>).agent_id as string) ?? null,
  };
}

// ---------------------------------------------------------------------------
// POST /api/webhooks/voice
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
    let body: Record<string, unknown>;
    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await request.formData();
      body = {};
      formData.forEach((value, key) => {
        body[key] = value;
      });
    } else {
      body = (await request.json()) as Record<string, unknown>;
    }

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
      'Voice call webhook received',
    );

    // ── Parse Webhook ────────────────────────────────────────────────
    let result: WebhookResult;

    try {
      switch (providerName) {
        case 'exotel':
          result = parseExotelWebhook(body);
          break;
        case 'twilio':
          result = parseTwilioWebhook(body);
          break;
        default:
          return NextResponse.json(
            { success: false, error: `Unsupported provider: ${providerName}` },
            { status: 400 },
          );
      }
    } catch (parseError) {
      logger.error({ error: parseError, provider: providerName }, 'Failed to parse webhook');
      return NextResponse.json(
        { success: false, error: 'Failed to parse webhook payload' },
        { status: 500 },
      );
    }

    // ── Update calls table ──────────────────────────────────────────
    const callRecord = await updateCallRecord(result.callSid, providerName, {
      status: result.status,
      recordingUrl: result.recordingUrl,
      duration: result.duration,
      price: result.price,
      transcription: result.transcription,
      error: result.error,
    });

    if (callRecord) {
      // Log activity
      await logActivity(
        callRecord.tenantId,
        null,
        'call_completed',
        callRecord.id,
        `Voice call ${result.callSid} updated to status: ${result.status}`,
        'call',
        {
          provider: providerName,
          status: result.status,
          duration: result.duration,
          price: result.price,
        },
      ).catch(() => {});
    }

    // ── Audit Log ────────────────────────────────────────────────────
    await auditLog({
      tenantId: callRecord?.tenantId ?? '',
      userId: 'webhook:voice',
      action: 'update',
      entityType: 'call',
      entityId: callRecord?.id ?? result.callSid,
      oldValues: null,
      newValues: {
        provider: providerName,
        status: result.status,
        duration: result.duration,
        price: result.price,
        callSid: result.callSid,
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
          callSid: result.callSid,
          status: result.status,
          recordingUrl: result.recordingUrl,
          duration: result.duration,
          message: 'Webhook processed successfully',
        },
      },
      { status: 200 },
    );
  } catch (error) {
    logger.error({ error }, 'Unhandled error in voice webhook');
    // Return 200 to prevent webhook provider retries on server errors.
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 200 },
    );
  }
}

// ---------------------------------------------------------------------------
// GET /api/webhooks/voice — Health check
// ---------------------------------------------------------------------------

export async function GET(_request: NextRequest): Promise<NextResponse> {
  return NextResponse.json(
    {
      success: true,
      data: {
        message: 'Voice call webhook endpoint is active',
        version: '1.0.0',
        supportedProviders: ['exotel', 'twilio'],
      },
    },
    { status: 200 },
  );
}
