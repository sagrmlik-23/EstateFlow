// ============================================================================
// EstateFlow CRM — WhatsApp Chatbot Webhook
// Phase 5 — AI Chatbot (AGENT-5-3-WHATSAPP-CHATBOT)
// ============================================================================
//
// POST /api/webhooks/chatbot/whatsapp — Incoming WhatsApp message from WATI
// GET  /api/webhooks/chatbot/whatsapp — WATI webhook verification
//
// Routes incoming messages to the WhatsAppBot for processing.
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { withRateLimit } from '@/lib/security/rateLimiter';
import { auditLog } from '@/lib/security/auditLogger';
import { WATIProvider } from '@/lib/communication/providers/wati';
import type { WATIWebhookPayload } from '@/lib/communication/providers/wati';
import { WhatsAppBot } from '@/lib/chatbot/whatsappBot';
import { HandoffService } from '@/lib/chatbot/handoffService';

// ---------------------------------------------------------------------------
// POST /api/webhooks/chatbot/whatsapp
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
    const tenantId = request.headers.get('x-tenant-id') ?? 'default';

    // ── Webhook Secret Verification ───────────────────────────────────
    const webhookSecret = request.headers.get('x-webhook-secret');
    const expectedSecret = process.env.WATI_WEBHOOK_SECRET;
    if (expectedSecret && webhookSecret !== expectedSecret) {
      return NextResponse.json(
        { success: false, error: 'Invalid webhook secret' },
        { status: 401 },
      );
    }

    // ── Parse payload ─────────────────────────────────────────────────
    const body = (await request.json()) as Record<string, unknown>;

    if (!body || !body.event) {
      return NextResponse.json(
        { success: false, error: 'Invalid WATI webhook payload' },
        { status: 400 },
      );
    }

    // ── Log incoming ──────────────────────────────────────────────────
    console.log('[webhooks/chatbot/whatsapp] Event received:', {
      event: body.event,
      from: body.from,
      type: body.type,
      tenantId,
    });

    // ── Only process message_received events ──────────────────────────
    if (body.event === 'message_received') {
      // Initialize services
      const watiProvider = new WATIProvider({
        apiKey: process.env.WATI_API_KEY ?? '',
        whatsappNumber: process.env.WATI_WHATSAPP_NUMBER ?? '',
      });
      const whatsappBot = new WhatsAppBot(watiProvider);
      const handoffService = new HandoffService();

      // Build WATI webhook payload from raw body
      const payload: WATIWebhookPayload = {
        event: body.event as WATIWebhookPayload['event'],
        id: (body.id as string) ?? undefined,
        from: (body.from as string) ?? undefined,
        to: (body.to as string) ?? undefined,
        body: (body.body as string) ?? undefined,
        type: (body.type as WATIWebhookPayload['type']) ?? 'text',
        mediaUrl: (body.mediaUrl as string) ?? undefined,
        fileName: (body.fileName as string) ?? undefined,
        latitude: (body.latitude as number) ?? undefined,
        longitude: (body.longitude as number) ?? undefined,
        label: (body.label as string) ?? undefined,
        buttonText: (body.buttonText as string) ?? undefined,
        timestamp: (body.timestamp as string) ?? undefined,
      };

      // Process the message through the chatbot
      const result = await whatsappBot.handleIncomingMessage(payload);

      // If handoff requested, create a handoff request
      if (result.handoffRequested) {
        const handoffInput = {
          sessionId: result.session.id,
          tenantId,
          phoneNumber: result.session.phoneNumber,
          reason: 'complex_query' as const,
          notes: `User requested human agent or conversation exceeded limits. Intent: ${result.response?.text ?? 'unknown'}`,
        };

        const handoffResult = await handoffService.requestHandoff(handoffInput);
        if (handoffResult.success) {
          console.log('[webhooks/chatbot/whatsapp] Handoff created:', handoffResult.handoff?.id);
        }
      }

      // ── Audit log (fire-and-forget) ────────────────────────────────
      await auditLog({
        tenantId,
        userId: 'webhook:chatbot-whatsapp',
        action: 'create',
        entityType: 'chatbot_message',
        entityId: payload.id ?? 'unknown',
        oldValues: null,
        newValues: {
          event: body.event,
          from: payload.from,
          type: payload.type,
          body: payload.body?.slice(0, 200) ?? null,
          hasMedia: !!payload.mediaUrl,
          handoffRequested: result.handoffRequested,
        },
        ipAddress: request.headers.get('x-forwarded-for') ?? null,
        userAgent: request.headers.get('user-agent') ?? null,
        requestId: crypto.randomUUID(),
      }).catch(() => {});
    }

    // ── Respond — WATI expects 200 OK ─────────────────────────────────
    return NextResponse.json(
      { success: true, data: { message: 'EVENT_RECEIVED' } },
      { status: 200 },
    );
  } catch (error) {
    console.error('[webhooks/chatbot/whatsapp]', error);
    // Always return 200 to prevent WATI retries
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 200 },
    );
  }
}

// ---------------------------------------------------------------------------
// GET /api/webhooks/chatbot/whatsapp — WATI Webhook Verification
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;
  const mode = searchParams.get('hub.mode');
  const challenge = searchParams.get('hub.challenge');

  const expectedToken = process.env.WATI_VERIFY_TOKEN ?? 'estateflow_wati_2024';

  if (mode === 'subscribe' && challenge) {
    console.log('[webhooks/chatbot/whatsapp] Webhook verified');
    return new NextResponse(challenge, { status: 200 });
  }

  console.warn('[webhooks/chatbot/whatsapp] Verification failed', { mode });
  return NextResponse.json(
    { success: false, error: 'Verification failed' },
    { status: 403 },
  );
}
