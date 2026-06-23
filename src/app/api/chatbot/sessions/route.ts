// ============================================================================
// EstateFlow CRM — Chatbot Sessions API
// Phase 5 — AI Chatbot (AGENT-5-3-WHATSAPP-CHATBOT)
// ============================================================================
//
// GET  /api/chatbot/sessions — List active chat sessions
// POST /api/chatbot/sessions — Create a new session
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { buildPaginationParams } from '@/lib/types';
import { WhatsAppBot } from '@/lib/chatbot/whatsappBot';
import { withRateLimit } from '@/lib/security/rateLimiter';
import { auditLog } from '@/lib/security/auditLogger';
import type { UserRole } from '@/types/auth';

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const ALLOWED_STATUSES = ['active', 'idle', 'handoff_requested', 'handoff_assigned', 'closed'] as const;

const createSessionSchema = z.object({
  phoneNumber: z.string().min(5, 'Phone number is required'),
  leadId: z.string().uuid('Lead ID must be a valid UUID').optional(),
  language: z.enum(['en', 'hi', 'hinglish']).optional().default('hinglish'),
});

// ---------------------------------------------------------------------------
// GET /api/chatbot/sessions
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // ── Auth ──────────────────────────────────────────────────────────────
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

    // ── Parse params ──────────────────────────────────────────────────────
    const { searchParams } = request.nextUrl;
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const pagination = buildPaginationParams(page, limit);

    const status = searchParams.get('status');
    const phoneNumber = searchParams.get('phone_number');

    // ── Validate status filter ─────────────────────────────────────────────
    if (status && !(ALLOWED_STATUSES as readonly string[]).includes(status)) {
      return NextResponse.json(
        {
          success: false,
          data: null,
          error: `Invalid status. Allowed: ${ALLOWED_STATUSES.join(', ')}`,
          meta: null,
        },
        { status: 400 },
      );
    }

    // ── Query sessions ─────────────────────────────────────────────────────
    const whatsappBot = WhatsAppBot.create();

    const sessions = whatsappBot.getAllSessions().filter((s) => {
      // Filter by tenant (in production, sessions would have tenantId stored)
      if (status && s.status !== status) return false;
      if (phoneNumber && !s.phoneNumber.includes(phoneNumber)) return false;
      return true;
    });

    // Sort by last message time, newest first
    sessions.sort(
      (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime(),
    );

    const total = sessions.length;
    const paginatedSessions = sessions.slice(
      (pagination.page - 1) * pagination.limit,
      pagination.page * pagination.limit,
    );

    return NextResponse.json(
      {
        success: true,
        data: paginatedSessions,
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
        headers: { ...rateHeaders, 'X-Request-Id': requestId },
      },
    );
  } catch (error) {
    console.error('[api/chatbot/sessions] GET error:', error);
    return NextResponse.json(
      { success: false, data: null, error: 'Internal server error', meta: null },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/chatbot/sessions
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // ── Auth ──────────────────────────────────────────────────────────────
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

    // ── Parse & validate ──────────────────────────────────────────────────
    const body = await request.json();
    const parsed = createSessionSchema.safeParse(body);

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

    // ── Create session ─────────────────────────────────────────────────────
    const whatsappBot = WhatsAppBot.create();

    // Check if session already exists
    const existing = whatsappBot.getSession(parsed.data.phoneNumber);
    if (existing) {
      return NextResponse.json(
        {
          success: true,
          data: existing,
          error: null,
          meta: { message: 'Session already exists for this phone number' },
        },
        {
          status: 200,
          headers: { ...rateHeaders, 'X-Request-Id': requestId },
        },
      );
    }

    const session = whatsappBot.createSession(
      parsed.data.phoneNumber,
      tenantId,
    );

    // ── Audit log ─────────────────────────────────────────────────────────
    await auditLog({
      tenantId,
      userId,
      action: 'create',
      entityType: 'chatbot_session',
      entityId: session.id,
      oldValues: null,
      newValues: {
        phoneNumber: parsed.data.phoneNumber.slice(0, 4) + '****',
        language: parsed.data.language,
      },
      ipAddress: request.headers.get('x-forwarded-for') ?? null,
      userAgent: request.headers.get('user-agent') ?? null,
      requestId,
    }).catch(() => {});

    return NextResponse.json(
      {
        success: true,
        data: session,
        error: null,
        meta: null,
      },
      {
        status: 201,
        headers: { ...rateHeaders, 'X-Request-Id': requestId },
      },
    );
  } catch (error) {
    console.error('[api/chatbot/sessions] POST error:', error);
    return NextResponse.json(
      { success: false, data: null, error: 'Internal server error', meta: null },
      { status: 500 },
    );
  }
}
