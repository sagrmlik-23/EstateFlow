import { NextResponse, type NextRequest } from 'next/server';
import { handleWebhookCallback } from '@/lib/leads/intakeWebhook';
import { withRateLimit } from '@/lib/security/rateLimiter';
import { auditLog } from '@/lib/security/auditLogger';
import { assignLeadToAgent } from '@/lib/leads/smartAssignment';
import { logActivity } from '@/lib/activity/queries';

/**
 * POST /api/webhooks/facebook
 *
 * Facebook Lead Ads webhook endpoint.
 *
 * Accepts the standard Facebook Lead Ads payload format and
 * converts it into an EstateFlow lead.
 *
 * Facebook sends two types of requests:
 *   1. GET — Verification request (hub.mode, hub.verify_token, hub.challenge)
 *   2. POST — Actual lead data
 *
 * Body (Facebook format):
 * {
 *   entry: [{
 *     changes: [{
 *       value: {
 *         leadgen_id: string,
 *         page_id: string,
 *         form_id: string,
 *         field_data: [{ name: string, values: string[] }]
 *       }
 *     }]
 *   }]
 * }
 *
 * Headers:
 *   x-tenant-id — Required. Tenant UUID to associate the lead with.
 *   x-webhook-secret — Optional. Shared secret for webhook verification.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // ── Rate Limit (webhook tier) ────────────────────────────────────
    const { result: rateLimitResult } = await withRateLimit(
      request,
      'webhook',
    );
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many requests' },
        { status: 429 },
      );
    }

    // ── Resolve Tenant ──────────────────────────────────────────────
    const tenantId = request.headers.get('x-tenant-id');
    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: 'x-tenant-id header is required' },
        { status: 400 },
      );
    }

    // ── Webhook Secret Verification ──────────────────────────────────
    const webhookSecret = request.headers.get('x-webhook-secret');
    const expectedSecret = process.env.FACEBOOK_WEBHOOK_SECRET;
    if (expectedSecret && webhookSecret !== expectedSecret) {
      return NextResponse.json(
        { success: false, error: 'Invalid webhook secret' },
        { status: 401 },
      );
    }

    // ── Parse Facebook Payload ───────────────────────────────────────
    const body = (await request.json()) as Record<string, unknown>;

    if (!body || !body.entry) {
      return NextResponse.json(
        { success: false, error: 'Invalid Facebook webhook payload' },
        { status: 400 },
      );
    }

    const entries = body.entry as Record<string, unknown>[];
    const results: Array<{ success: boolean; leadId?: string; duplicate?: boolean }> = [];

    for (const entry of entries) {
      const changes = entry.changes as Record<string, unknown>[];
      if (!changes) continue;

      for (const change of changes) {
        const value = change.value as Record<string, unknown> | undefined;
        if (!value) continue;

        // Process the Facebook lead
        const result = await handleWebhookCallback('facebook', value, tenantId);

        if (result.success && result.lead) {
          // Smart assignment
          await assignLeadToAgent(
            result.lead.id,
            tenantId,
            'workload',
            result.lead.propertyType ?? undefined,
          ).catch(() => {});

          // Log activity
          await logActivity(
            tenantId,
            null,
            'webhook_received',
            result.lead.id,
            `Facebook lead: ${result.lead.firstName} ${result.lead.lastName}`,
            'lead',
            { source: 'facebook', facebookLeadId: value.leadgen_id },
          ).catch(() => {});

          results.push({ success: true, leadId: result.lead.id, duplicate: false });
        } else if (result.duplicate) {
          results.push({ success: true, leadId: undefined, duplicate: true });
        } else {
          results.push({ success: false });
        }
      }
    }

    // ── Audit Log ────────────────────────────────────────────────────
    await auditLog({
      tenantId,
      userId: 'webhook:facebook',
      action: 'create',
      entityType: 'lead',
      entityId: results.map((r) => r.leadId).filter(Boolean).join(','),
      oldValues: null,
      newValues: { resultsCount: results.length },
      ipAddress: request.headers.get('x-forwarded-for') ?? null,
      userAgent: request.headers.get('user-agent') ?? null,
      requestId: crypto.randomUUID(),
    }).catch(() => {});

    // Facebook expects 200 OK with "EVENT_RECEIVED" in body
    return NextResponse.json(
      {
        success: true,
        data: {
          message: 'EVENT_RECEIVED',
          results,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    console.error('[webhooks/facebook]', error);
    // Facebook webhooks should always return 200 to prevent retries
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 200 },
    );
  }
}

/**
 * GET /api/webhooks/facebook
 *
 * Facebook webhook verification endpoint.
 *
 * When setting up the webhook in Facebook Developer Console,
 * Facebook sends a GET request with hub.mode, hub.verify_token,
 * and hub.challenge. We verify the token and return the challenge.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  const expectedToken = process.env.FACEBOOK_VERIFY_TOKEN ?? 'estateflow_webhook_2024';

  if (mode === 'subscribe' && token === expectedToken && challenge) {
    console.log('[webhooks/facebook] Webhook verified successfully');
    return new NextResponse(challenge, { status: 200 });
  }

  console.warn('[webhooks/facebook] Verification failed', { mode, token });
  return NextResponse.json(
    { success: false, error: 'Verification failed' },
    { status: 403 },
  );
}
