// ============================================================================
// EstateFlow CRM — Chatbot Handoff API
// Phase 5 — AI Chatbot (AGENT-5-3-WHATSAPP-CHATBOT)
// ============================================================================
//
// POST /api/chatbot/handoff — Request a handoff to human agent
// GET  /api/chatbot/handoff  — List handoff requests
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { buildPaginationParams } from '@/lib/types';
import { HandoffService } from '@/lib/chatbot/handoffService';
import { withRateLimit } from '@/lib/security/rateLimiter';
import { auditLog } from '@/lib/security/auditLogger';
import type { UserRole } from '@/types/auth';

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const ALLOWED_REASONS = [
  'complex_query',
  'lead_quality',
  'complaint',
  'not_interested',
  'price_negotiation',
  'schedule_visit',
  'document_request',
  'other',
] as const;

const ALLOWED_STATUSES = ['pending', 'assigned', 'resolved', 'cancelled'] as const;

const requestHandoffSchema = z.object({
  sessionId: z.string().uuid('Session ID must be a valid UUID'),
  phoneNumber: z.string().min(5, 'Phone number is required'),
  reason: z.enum(ALLOWED_REASONS),
  notes: z.string().max(2000).optional(),
});

// ---------------------------------------------------------------------------
// GET /api/chatbot/handoff
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
    const sessionId = searchParams.get('session_id');
    const assignedTo = searchParams.get('assigned_to');

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

    // ── Query handoffs ─────────────────────────────────────────────────────
    const handoffService = HandoffService.create();
    const handoffs = handoffService.listHandoffs({
      tenantId,
      status: status as HandoffServiceHandoffStatus | undefined,
      sessionId: sessionId ?? undefined,
      assignedTo: assignedTo ?? undefined,
      limit: pagination.limit,
      offset: (pagination.page - 1) * pagination.limit,
    });

    const total = handoffService.listHandoffs({ tenantId }).length;

    return NextResponse.json(
      {
        success: true,
        data: handoffs,
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
    console.error('[api/chatbot/handoff] GET error:', error);
    return NextResponse.json(
      { success: false, data: null, error: 'Internal server error', meta: null },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/chatbot/handoff
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
    const parsed = requestHandoffSchema.safeParse(body);

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

    // ── Create handoff ─────────────────────────────────────────────────────
    const handoffService = HandoffService.create();
    const result = await handoffService.requestHandoff({
      sessionId: parsed.data.sessionId,
      tenantId,
      phoneNumber: parsed.data.phoneNumber,
      reason: parsed.data.reason,
      notes: parsed.data.notes,
    });

    // ── Audit log ─────────────────────────────────────────────────────────
    await auditLog({
      tenantId,
      userId,
      action: 'create',
      entityType: 'handoff',
      entityId: result.handoff?.id ?? 'unknown',
      oldValues: null,
      newValues: {
        sessionId: parsed.data.sessionId,
        reason: parsed.data.reason,
        phoneNumber: parsed.data.phoneNumber.slice(0, 4) + '****',
      },
      ipAddress: request.headers.get('x-forwarded-for') ?? null,
      userAgent: request.headers.get('user-agent') ?? null,
      requestId,
    }).catch(() => {});

    const statusCode = result.success ? 201 : 400;

    return NextResponse.json(
      {
        success: result.success,
        data: result.success ? result.handoff : null,
        error: result.error ?? null,
        meta: null,
      },
      {
        status: statusCode,
        headers: { ...rateHeaders, 'X-Request-Id': requestId },
      },
    );
  } catch (error) {
    console.error('[api/chatbot/handoff] POST error:', error);
    return NextResponse.json(
      { success: false, data: null, error: 'Internal server error', meta: null },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// Type helper for status filtering
// ---------------------------------------------------------------------------

type HandoffServiceHandoffStatus = 'pending' | 'assigned' | 'resolved' | 'cancelled';
