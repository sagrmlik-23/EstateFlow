// ============================================================================
// EstateFlow CRM — Messages API
// POST /api/communication/messages  — Send a message (WhatsApp/SMS auto-detect)
// GET  /api/communication/messages  — List messages with filters
// Phase 4 — Communication (AGENT-4-2-WHATSAPP-SMS)
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { buildPaginationParams } from '@/lib/types';
import { MessageService } from '@/lib/communication/messageService';
import { withRateLimit } from '@/lib/security/rateLimiter';
import { auditLog } from '@/lib/security/auditLogger';
import type { UserRole } from '@/types/auth';

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const ALLOWED_CHANNELS = ['whatsapp', 'sms', 'email', 'in_app', 'web'] as const;
const ALLOWED_DIRECTIONS = ['outbound', 'inbound'] as const;
const ALLOWED_STATUSES = ['queued', 'sent', 'delivered', 'read', 'failed'] as const;
const ALLOWED_SORT_COLUMNS = ['created_at', 'status', 'channel', 'direction'] as const;

const sendMessageSchema = z.object({
  to: z.string().min(5, 'Recipient phone number is required'),
  content: z.string().min(1, 'Message content is required').max(5000),
  channel: z.enum(ALLOWED_CHANNELS).optional().default('whatsapp'),
  template_name: z.string().max(100).optional(),
  template_params: z.record(z.string()).optional(),
  dlt_template_id: z.string().max(50).optional(),
  unicode: z.boolean().optional(),
  lead_id: z.string().uuid().nullable().optional(),
  property_id: z.string().uuid().nullable().optional(),
  tenant_id: z.string().uuid().optional(),
});

export type SendMessageBody = z.infer<typeof sendMessageSchema>;

// ---------------------------------------------------------------------------
// GET /api/communication/messages
// ---------------------------------------------------------------------------

/**
 * GET /api/communication/messages
 *
 * Query parameters:
 *   page, limit        — Pagination
 *   channel            — Filter by channel (whatsapp, sms, email, in_app, web)
 *   direction          — Filter by direction (outbound, inbound)
 *   status             — Filter by status (queued, sent, delivered, read, failed)
 *   lead_id            — Filter by lead UUID
 *   tenant_id          — Filter by tenant UUID
 *   created_after      — ISO date string (inclusive)
 *   created_before     — ISO date string (inclusive)
 *   sort_by            — Sort column (default: created_at)
 *   sort_dir           — asc or desc (default: desc)
 */
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

    const sortBy = searchParams.get('sort_by') || 'created_at';
    if (!(ALLOWED_SORT_COLUMNS as readonly string[]).includes(sortBy)) {
      return NextResponse.json(
        { success: false, data: null, error: `Invalid sort_by. Allowed: ${ALLOWED_SORT_COLUMNS.join(', ')}`, meta: null },
        { status: 400 },
      );
    }
    const sortDir = searchParams.get('sort_dir') === 'asc' ? 'asc' : 'desc';

    // ── Build filters ──────────────────────────────────────────────────────
    const filters: Record<string, unknown> = { tenant_id: tenantId };

    const channel = searchParams.get('channel');
    if (channel && (ALLOWED_CHANNELS as readonly string[]).includes(channel)) {
      filters.channel = channel;
    }

    const direction = searchParams.get('direction');
    if (direction && (ALLOWED_DIRECTIONS as readonly string[]).includes(direction)) {
      filters.direction = direction;
    }

    const status = searchParams.get('status');
    if (status && (ALLOWED_STATUSES as readonly string[]).includes(status)) {
      filters.status = status;
    }

    const leadId = searchParams.get('lead_id');
    if (leadId) filters.lead_id = leadId;

    if (searchParams.get('created_after')) {
      filters.created_after = searchParams.get('created_after')!;
    }
    if (searchParams.get('created_before')) {
      filters.created_before = searchParams.get('created_before')!;
    }

    // ── In production, query the database here ────────────────────────────
    // For now, this is a placeholder that returns empty results.
    // The actual DB queries will be added in a later phase.
    // import { getMessages } from '@/lib/communication/queries';
    // const result = await getMessages(tenantId, filters, pagination, sortBy, sortDir);

    const data: unknown[] = [];
    const total = 0;

    return NextResponse.json(
      {
        success: true,
        data,
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
    console.error('[api/communication/messages] GET error:', error);
    return NextResponse.json(
      { success: false, data: null, error: 'Internal server error', meta: null },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/communication/messages
// ---------------------------------------------------------------------------

/**
 * POST /api/communication/messages
 *
 * Sends a message via WhatsApp or SMS (auto-detect based on channel field).
 * Uses the MessageService which handles dry-run mode and channel preference.
 *
 * Body: { to, content, channel?, template_name?, template_params?,
 *         dlt_template_id?, unicode?, lead_id?, property_id? }
 */
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

    // ── Send message ──────────────────────────────────────────────────────
    const messageService = MessageService.create();

    let result;

    if (parsed.data.channel === 'whatsapp') {
      result = await messageService.sendMessage(
        parsed.data.to,
        parsed.data.content,
        {
          channel: 'whatsapp',
          templateParams: parsed.data.template_params,
        },
      );
    } else if (parsed.data.channel === 'sms') {
      result = await messageService.sendMessage(
        parsed.data.to,
        parsed.data.content,
        {
          channel: 'sms',
          templateParams: parsed.data.template_params,
          dltTemplateId: parsed.data.dlt_template_id,
          unicode: parsed.data.unicode,
        },
      );
    } else {
      // For non-whatsapp/sms channels, just log and return success
      result = {
        success: true,
        messageId: `dry-run-${Date.now()}`,
        channel: parsed.data.channel,
        dryRun: true,
      };
    }

    // ── Audit log ─────────────────────────────────────────────────────────
    await auditLog({
      tenantId,
      userId,
      action: 'create',
      entityType: 'message',
      entityId: result.messageId ?? 'unknown',
      oldValues: null,
      newValues: {
        to: parsed.data.to.slice(0, 4) + '****' + parsed.data.to.slice(-2),
        channel: parsed.data.channel,
        contentLength: parsed.data.content.length,
        dryRun: result.dryRun,
        leadId: parsed.data.lead_id,
      },
      ipAddress: request.headers.get('x-forwarded-for') ?? null,
      userAgent: request.headers.get('user-agent') ?? null,
      requestId,
    }).catch(() => {});

    const statusCode = result.success ? 201 : 400;

    return NextResponse.json(
      {
        success: result.success,
        data: result.success ? {
          messageId: result.messageId,
          channel: result.channel,
          dryRun: result.dryRun,
        } : null,
        error: result.error ?? null,
        meta: null,
      },
      {
        status: statusCode,
        headers: { ...rateHeaders, 'X-Request-Id': requestId },
      },
    );
  } catch (error) {
    console.error('[api/communication/messages] POST error:', error);
    return NextResponse.json(
      { success: false, data: null, error: 'Internal server error', meta: null },
      { status: 500 },
    );
  }
}
