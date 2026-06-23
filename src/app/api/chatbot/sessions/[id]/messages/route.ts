// ============================================================================
// EstateFlow CRM — Chatbot Session Messages API
// Phase 5 — AI Chatbot (AGENT-5-3-WHATSAPP-CHATBOT)
// ============================================================================
//
// GET  /api/chatbot/sessions/[id]/messages — Get session message history
// POST /api/chatbot/sessions/[id]/messages — Send a message in a session
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { buildPaginationParams } from '@/lib/types';
import { WhatsAppBot } from '@/lib/chatbot/whatsappBot';
import { WATIProvider } from '@/lib/communication/providers/wati';
import { withRateLimit } from '@/lib/security/rateLimiter';
import { auditLog } from '@/lib/security/auditLogger';

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const ALLOWED_MESSAGE_TYPES = ['text', 'image', 'location'] as const;

const sendMessageSchema = z.object({
  content: z.string().min(1, 'Message content is required').max(5000),
  type: z.enum(ALLOWED_MESSAGE_TYPES).optional().default('text'),
  mediaUrl: z.string().url().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  label: z.string().max(200).optional(),
});

// ---------------------------------------------------------------------------
// GET /api/chatbot/sessions/[id]/messages
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await params;

    // ── Auth headers ───────────────────────────────────────────────────────
    const userId = request.headers.get('x-user-id');
    const tenantId = request.headers.get('x-tenant-id');
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

    // ── Verify session exists ──────────────────────────────────────────────
    const whatsappBot = WhatsAppBot.create();
    const session = whatsappBot.getSessionById(id);

    if (!session) {
      return NextResponse.json(
        { success: false, data: null, error: 'Session not found', meta: null },
        { status: 404 },
      );
    }

    // ── Parse pagination params ────────────────────────────────────────────
    const { searchParams } = request.nextUrl;
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const pagination = buildPaginationParams(page, limit);

    // ── Get messages ───────────────────────────────────────────────────────
    const messages = whatsappBot.getSessionMessages(id);

    // Sort by timestamp ascending (oldest first)
    messages.sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );

    const total = messages.length;
    const paginatedMessages = messages.slice(
      (pagination.page - 1) * pagination.limit,
      pagination.page * pagination.limit,
    );

    return NextResponse.json(
      {
        success: true,
        data: paginatedMessages,
        error: null,
        meta: {
          page: pagination.page,
          limit: pagination.limit,
          total,
          total_pages: Math.ceil(total / pagination.limit),
          session_status: session.status,
        },
      },
      {
        status: 200,
        headers: { ...rateHeaders, 'X-Request-Id': requestId },
      },
    );
  } catch (error) {
    console.error('[api/chatbot/sessions/:id/messages] GET error:', error);
    return NextResponse.json(
      { success: false, data: null, error: 'Internal server error', meta: null },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/chatbot/sessions/[id]/messages
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await params;

    // ── Auth headers ───────────────────────────────────────────────────────
    const userId = request.headers.get('x-user-id');
    const tenantId = request.headers.get('x-tenant-id');
    const userRole = request.headers.get('x-user-role') as import('@/types/auth').UserRole | null;
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

    // ── Verify session exists ──────────────────────────────────────────────
    const whatsappBot = WhatsAppBot.create();
    const session = whatsappBot.getSessionById(id);

    if (!session) {
      return NextResponse.json(
        { success: false, data: null, error: 'Session not found', meta: null },
        { status: 404 },
      );
    }

    if (session.status === 'closed') {
      return NextResponse.json(
        { success: false, data: null, error: 'Session is closed. Cannot send messages.', meta: null },
        { status: 400 },
      );
    }

    // ── Parse & validate ──────────────────────────────────────────────────
    const body = await request.json();
    const parsed = sendMessageSchema.safeParse(body);

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

    // ── Send message via WATI provider ─────────────────────────────────────
    const watiProvider = new WATIProvider({
      apiKey: process.env.WATI_API_KEY ?? '',
      whatsappNumber: process.env.WATI_WHATSAPP_NUMBER ?? '',
    });

    let sendResult;

    switch (parsed.data.type) {
      case 'image':
        if (!parsed.data.mediaUrl) {
          return NextResponse.json(
            { success: false, data: null, error: 'mediaUrl is required for image messages', meta: null },
            { status: 400 },
          );
        }
        sendResult = await watiProvider.sendImage(
          session.phoneNumber,
          parsed.data.mediaUrl,
          parsed.data.content ?? undefined,
        );
        break;

      case 'location':
        if (parsed.data.latitude == null || parsed.data.longitude == null) {
          return NextResponse.json(
            { success: false, data: null, error: 'latitude and longitude are required for location messages', meta: null },
            { status: 400 },
          );
        }
        sendResult = await watiProvider.sendLocation(
          session.phoneNumber,
          parsed.data.latitude,
          parsed.data.longitude,
          parsed.data.label ?? parsed.data.content ?? undefined,
        );
        break;

      case 'text':
      default:
        sendResult = await watiProvider.sendMessage(
          session.phoneNumber,
          'custom_message',
          {
            message: parsed.data.content ?? '',
            templateName: 'custom_message',
          },
        );
        break;
    }

    // ── Record message in session history ──────────────────────────────────
    const outboundMessage = {
      id: sendResult.messageId ?? crypto.randomUUID(),
      sessionId: id,
      from: process.env.WATI_WHATSAPP_NUMBER ?? '',
      to: session.phoneNumber,
      type: parsed.data.type,
      content: parsed.data.content,
      mediaUrl: parsed.data.mediaUrl,
      latitude: parsed.data.latitude,
      longitude: parsed.data.longitude,
      label: parsed.data.label,
      timestamp: new Date().toISOString(),
      direction: 'outbound' as const,
      metadata: {
        sentBy: userId,
        userRole,
        messageId: sendResult.messageId,
      },
    };

    // Update session timestamp
    if (session) {
      session.lastMessageAt = new Date().toISOString();
    }

    // ── Audit log ─────────────────────────────────────────────────────────
    await auditLog({
      tenantId,
      userId,
      action: 'create',
      entityType: 'chatbot_message',
      entityId: outboundMessage.id,
      oldValues: null,
      newValues: {
        sessionId: id,
        type: parsed.data.type,
        contentLength: parsed.data.content?.length ?? 0,
        phoneNumber: session.phoneNumber.slice(0, 4) + '****',
        success: sendResult.success,
      },
      ipAddress: request.headers.get('x-forwarded-for') ?? null,
      userAgent: request.headers.get('user-agent') ?? null,
      requestId,
    }).catch(() => {});

    const statusCode = sendResult.success ? 201 : 400;

    return NextResponse.json(
      {
        success: sendResult.success,
        data: sendResult.success
          ? {
              messageId: outboundMessage.id,
              providerMessageId: sendResult.messageId,
              type: parsed.data.type,
              status: 'sent',
            }
          : null,
        error: sendResult.error ?? null,
        meta: null,
      },
      {
        status: statusCode,
        headers: { ...rateHeaders, 'X-Request-Id': requestId },
      },
    );
  } catch (error) {
    console.error('[api/chatbot/sessions/:id/messages] POST error:', error);
    return NextResponse.json(
      { success: false, data: null, error: 'Internal server error', meta: null },
      { status: 500 },
    );
  }
}
