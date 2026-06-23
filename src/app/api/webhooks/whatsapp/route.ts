// ============================================================================
// EstateFlow CRM — WATI WhatsApp Webhook
// Phase 4 — Communication (AGENT-4-2-WHATSAPP-SMS)
// ============================================================================
//
// POST /api/webhooks/whatsapp — Receive incoming WhatsApp messages from WATI
// GET  /api/webhooks/whatsapp — WATI webhook verification
//
// WATI sends payloads in multiple formats. Common shapes:
//   { event: 'message_received', id: '...', from: '+919****', body: '...', type: 'text' }
//   { event: 'message_delivered', id: '...', status: 'delivered' }
//   { event: 'message_read', id: '...' }
//
// Headers:
//   x-webhook-secret — Optional. Secret to verify the webhook sender.
//   x-tenant-id — Required for multi-tenant routing.
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { withRateLimit } from '@/lib/security/rateLimiter';
import { auditLog } from '@/lib/security/auditLogger';

// ---------------------------------------------------------------------------
// POST /api/webhooks/whatsapp
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // ── Rate Limit ────────────────────────────────────────────────────
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

    // ── Tenant ────────────────────────────────────────────────────────
    const tenantId = request.headers.get('x-tenant-id');
    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: 'x-tenant-id header is required' },
        { status: 400 },
      );
    }

    // ── Webhook Secret Verification ───────────────────────────────────
    const webhookSecret = request.headers.get('x-webhook-secret');
    const expectedSecret = process.env.WATI_WEBHOOK_SECRET;
    if (expectedSecret && webhookSecret !== expectedSecret) {
      return NextResponse.json(
        { success: false, error: 'Invalid webhook secret' },
        { status: 401 },
      );
    }

    // ── Parse payload ────────────────────────────────────────────────
    const body = (await request.json()) as Record<string, unknown>;

    if (!body || !body.event) {
      return NextResponse.json(
        { success: false, error: 'Invalid WATI webhook payload' },
        { status: 400 },
      );
    }

    const event = body.event as string;
    const messageId = (body.id as string) ?? undefined;
    const from = (body.from as string) ?? undefined;
    const messageBody = (body.body as string) ?? undefined;
    const messageType = (body.type as string) ?? 'text';
    const mediaUrl = (body.mediaUrl as string) ?? undefined;

    // ── Log event ─────────────────────────────────────────────────────
    console.log('[webhooks/whatsapp] Event received:', {
      event,
      messageId,
      from,
      type: messageType,
      tenantId,
    });

    // ── Audit log (fire-and-forget) ───────────────────────────────────
    await auditLog({
      tenantId,
      userId: 'webhook:wati',
      action: 'create',
      entityType: 'message',
      entityId: messageId ?? 'unknown',
      oldValues: null,
      newValues: {
        event,
        from,
        type: messageType,
        body: messageBody ? messageBody.slice(0, 200) : null,
        hasMedia: !!mediaUrl,
      },
      ipAddress: request.headers.get('x-forwarded-for') ?? null,
      userAgent: request.headers.get('user-agent') ?? null,
      requestId: crypto.randomUUID(),
    }).catch(() => {});

    // ── Respond — WATI expects 200 OK ─────────────────────────────────
    return NextResponse.json(
      {
        success: true,
        data: {
          message: 'EVENT_RECEIVED',
          event,
          messageId,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    console.error('[webhooks/whatsapp]', error);
    // Always return 200 to prevent WATI retries
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 200 },
    );
  }
}

// ---------------------------------------------------------------------------
// GET /api/webhooks/whatsapp — WATI Webhook Verification
// ---------------------------------------------------------------------------
//
// When setting up the webhook in WATI dashboard, WATI sends a GET request
// with hub.mode and hub.challenge parameters.
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;
  const mode = searchParams.get('hub.mode');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && challenge) {
    console.log('[webhooks/whatsapp] Webhook verified');
    return new NextResponse(challenge, { status: 200 });
  }

  console.warn('[webhooks/whatsapp] Verification failed', { mode });
  return NextResponse.json(
    { success: false, error: 'Verification failed' },
    { status: 403 },
  );
}
