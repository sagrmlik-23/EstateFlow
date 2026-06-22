// ============================================================================
// EstateFlow CRM — AI Call Queue Cron Job
// GET /api/cron/ai-call-queue — Fetches pending calls and initiates them
// Phase 3 — AI Voice Agent
// ============================================================================
//
// This endpoint is designed to be called by a cron trigger (e.g., Vercel
// Cron Jobs, pg_cron, or an external scheduler) every minute.
//
//   - Fetches all queued calls where scheduled_at <= NOW()
//   - Calls the telephony provider to initiate each call
//   - Updates the queue status
//   - Enforces rate limit (max 50 calls per minute per tenant)
//   - Returns a summary JSON response
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';

import { getPendingCalls, updateCallStatus, failCall } from '@/lib/ai/callQueue';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_CALLS_PER_TENANT_PER_MINUTE = 50;
const CRON_SECRET = process.env.CRON_SECRET || '';

// ---------------------------------------------------------------------------
// GET /api/cron/ai-call-queue
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // ── Validate cron secret ──────────────────────────────────────────────
    const authHeader = request.headers.get('authorization');
    const expectedToken = `Bearer ${CRON_SECRET}`;

    // Only enforce the cron secret in production
    if (process.env.NODE_ENV === 'production') {
      if (!authHeader || authHeader !== expectedToken) {
        return NextResponse.json(
          { success: false, error: 'Unauthorized — invalid cron secret' },
          { status: 401 },
        );
      }
    }

    // ── Fetch pending calls ────────────────────────────────────────────────
    // Fetch more than we may use to allow per-tenant rate limiting
    const pendingCalls = await getPendingCalls(100);

    if (pendingCalls.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          processed: 0,
          skipped: 0,
          failed: 0,
          total_pending: 0,
          message: 'No pending calls',
        },
      });
    }

    // ── Group by tenant for rate limiting ─────────────────────────────────
    const callsByTenant = new Map<string, typeof pendingCalls>();

    for (const call of pendingCalls) {
      const tenantCalls = callsByTenant.get(call.tenant_id) || [];
      if (tenantCalls.length < MAX_CALLS_PER_TENANT_PER_MINUTE) {
        tenantCalls.push(call);
      }
      callsByTenant.set(call.tenant_id, tenantCalls);
    }

    // ── Process calls: init via telephony provider ────────────────────────
    const providerType = process.env.AI_CALL_PROVIDER || 'twilio';
    const results = {
      processed: 0,
      skipped: 0,
      failed: 0,
      errors: [] as string[],
    };

    // Flatten back to a single ordered list, respecting per-tenant limits
    const callsToProcess = Array.from(callsByTenant.values()).flat();

    for (const call of callsToProcess) {
      try {
        // Mark as ringing/initiated
        await updateCallStatus(call.id, 'ringing');

        // Attempt to initiate the call via the configured provider
        const providerCallId = await initiateProviderCall(
          call.phone,
          call.script || '',
          call.voice || undefined,
          call.language || 'en',
        );

        if (providerCallId) {
          await updateCallStatus(call.id, 'in_progress', providerCallId);
          results.processed++;
        } else {
          await failCall(call.id, 'Provider returned no call ID');
          results.failed++;
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Unknown error';
        await failCall(call.id, errMsg);
        results.failed++;
        results.errors.push(`Call ${call.id}: ${errMsg}`);
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        processed: results.processed,
        skipped: pendingCalls.length - callsToProcess.length,
        failed: results.failed,
        total_pending: pendingCalls.length,
        message: `Processed ${results.processed} calls, ${results.failed} failed`,
        errors: results.errors.length > 0 ? results.errors : undefined,
      },
    });
  } catch (error) {
    console.error('[cron/ai-call-queue] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// Telephony Provider Abstraction
// ---------------------------------------------------------------------------

/**
 * Initiate a call via the configured telephony provider.
 *
 * Supports:
 *   - twilio (default)
 *   - plivo
 *   - mock (for development/testing)
 *
 * Returns the provider's call ID on success, or null on failure.
 *
 * @param phone      - Callee phone number
 * @param script     - The script/text to speak (TTS)
 * @param voice      - Voice identifier (e.g., 'man-natural', 'woman-natural')
 * @param language   - Language code (e.g., 'en', 'hi')
 * @returns Provider call ID or null
 */
async function initiateProviderCall(
  phone: string,
  script: string,
  voice?: string,
  language?: string,
): Promise<string | null> {
  const provider = process.env.AI_CALL_PROVIDER || 'mock';

  switch (provider) {
    case 'twilio':
      return initiateTwilioCall(phone, script, voice, language);
    case 'plivo':
      return initiatePlivoCall(phone, script, voice, language);
    case 'mock':
    default:
      return initiateMockCall(phone);
  }
}

/**
 * Mock provider — generates a fake call ID for development.
 */
async function initiateMockCall(phone: string): Promise<string> {
  // Simulate provider latency
  await new Promise((resolve) => setTimeout(resolve, 100));
  return `mock-call-${crypto.randomUUID().slice(0, 8)}`;
}

/**
 * Twilio provider — initiates a call via Twilio Voice API.
 */
async function initiateTwilioCall(
  phone: string,
  script: string,
  voice?: string,
  language?: string,
): Promise<string | null> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !twilioPhone) {
    console.warn('[cron] Twilio not configured. Using mock provider.');
    return initiateMockCall(phone);
  }

  try {
    // Build TwiML response with <Say> for TTS
    const twimlUrl = process.env.TWILIO_TWIML_URL ||
      `${process.env.NEXT_PUBLIC_BASE_URL || 'https://estateflow.app'}/api/twilio/twiml`;

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: phone,
          From: twilioPhone,
          Url: twimlUrl,
          StatusCallback: process.env.TWILIO_STATUS_CALLBACK_URL || '',
          Timeout: '30',
        }).toString(),
      },
    );

    if (!response.ok) {
      const errBody = await response.text();
      console.error('[cron] Twilio API error:', response.status, errBody);
      return null;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await response.json();
    return data.sid || null;
  } catch (err) {
    console.error('[cron] Twilio call failed:', err);
    return null;
  }
}

/**
 * Plivo provider — initiates a call via Plivo Voice API.
 */
async function initiatePlivoCall(
  phone: string,
  script: string,
  voice?: string,
  language?: string,
): Promise<string | null> {
  const authId = process.env.PLIVO_AUTH_ID;
  const authToken = process.env.PLIVO_AUTH_TOKEN;
  const plivoPhone = process.env.PLIVO_PHONE_NUMBER;

  if (!authId || !authToken || !plivoPhone) {
    console.warn('[cron] Plivo not configured. Using mock provider.');
    return initiateMockCall(phone);
  }

  try {
    const answerUrl = process.env.PLIVO_ANSWER_URL ||
      `${process.env.NEXT_PUBLIC_BASE_URL || 'https://estateflow.app'}/api/plivo/answer`;

    const response = await fetch(
      `https://api.plivo.com/v1/Account/${authId}/Call/`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${Buffer.from(`${authId}:${authToken}`).toString('base64')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: plivoPhone,
          to: phone,
          answer_url: answerUrl,
          answer_method: 'POST',
          time_limit: 120, // 2 minutes max
          hangup_url: process.env.PLIVO_HANGUP_URL || '',
        }),
      },
    );

    if (!response.ok) {
      const errBody = await response.text();
      console.error('[cron] Plivo API error:', response.status, errBody);
      return null;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await response.json();
    return data.request_uuid || null;
  } catch (err) {
    console.error('[cron] Plivo call failed:', err);
    return null;
  }
}
