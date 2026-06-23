// ============================================================================
// EstateFlow CRM — Chatbot Handoff Detail API
// Phase 5 — AI Chatbot (AGENT-5-3-WHATSAPP-CHATBOT)
// ============================================================================
//
// PATCH /api/chatbot/handoff/[id] — Assign or close a handoff request
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { HandoffService } from '@/lib/chatbot/handoffService';
import { withRateLimit } from '@/lib/security/rateLimiter';
import { auditLog } from '@/lib/security/auditLogger';

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const ALLOWED_ACTIONS = ['assign', 'close'] as const;

const patchHandoffSchema = z.object({
  action: z.enum(ALLOWED_ACTIONS, { errorMap: () => ({ message: 'Action must be "assign" or "close"' }) }),
  agentId: z.string().uuid('Agent ID must be a valid UUID').optional(),
  resolution: z.string().max(500).optional(),
}).refine(
  (data) => {
    if (data.action === 'assign' && !data.agentId) {
      return false;
    }
    return true;
  },
  { message: 'agentId is required when action is "assign"' },
);

// ---------------------------------------------------------------------------
// PATCH /api/chatbot/handoff/[id]
// ---------------------------------------------------------------------------

export async function PATCH(
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

    // ── Parse & validate ──────────────────────────────────────────────────
    const body = await request.json();
    const parsed = patchHandoffSchema.safeParse(body);

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

    // ── Process handoff action ─────────────────────────────────────────────
    const handoffService = HandoffService.create();

    // First, verify the handoff exists and belongs to this tenant
    const existingHandoff = handoffService.getHandoffById(id);
    if (!existingHandoff) {
      return NextResponse.json(
        { success: false, data: null, error: 'Handoff not found', meta: null },
        { status: 404 },
      );
    }

    if (existingHandoff.tenantId !== tenantId) {
      return NextResponse.json(
        { success: false, data: null, error: 'Handoff not found for this tenant', meta: null },
        { status: 404 },
      );
    }

    let result;

    if (parsed.data.action === 'assign') {
      result = await handoffService.assignHandoff({
        handoffId: id,
        agentId: parsed.data.agentId!,
        tenantId,
      });
    } else {
      // Close action
      result = await handoffService.closeHandoff(id, parsed.data.resolution);
    }

    // ── Audit log ─────────────────────────────────────────────────────────
    await auditLog({
      tenantId,
      userId,
      action: 'update',
      entityType: 'handoff',
      entityId: id,
      oldValues: { status: existingHandoff.status },
      newValues: {
        action: parsed.data.action,
        status: result.handoff?.status,
        agentId: parsed.data.agentId,
        resolution: parsed.data.resolution,
      },
      ipAddress: request.headers.get('x-forwarded-for') ?? null,
      userAgent: request.headers.get('user-agent') ?? null,
      requestId,
    }).catch(() => {});

    const statusCode = result.success ? 200 : 400;

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
    console.error('[api/chatbot/handoff/:id] PATCH error:', error);
    return NextResponse.json(
      { success: false, data: null, error: 'Internal server error', meta: null },
      { status: 500 },
    );
  }
}
