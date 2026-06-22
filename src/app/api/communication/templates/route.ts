// ============================================================================
// EstateFlow CRM — Message Templates API
// GET  /api/communication/templates  — List templates
// POST /api/communication/templates  — Create template
// Phase 4 — Communication (AGENT-4-4-TEMPLATES-SHARING)
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  getTenantTemplates,
  createTemplate,
} from '@/lib/communication/templates';
import type { TemplateChannel, TemplateCategory } from '@/lib/communication/templates';
import { withRateLimit } from '@/lib/security/rateLimiter';
import { auditLog } from '@/lib/security/auditLogger';
import type { UserRole } from '@/types/auth';

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const ALLOWED_CHANNELS = ['whatsapp', 'sms', 'email'] as const;
const ALLOWED_CATEGORIES = [
  'lead_confirmation',
  'site_visit_reminder',
  'follow_up',
  'deal_won',
  'deal_lost',
  'property_share',
  'custom',
] as const;

const createTemplateSchema = z.object({
  name: z.string().min(1, 'Template name is required').max(100),
  channel: z.enum(ALLOWED_CHANNELS),
  category: z.enum(ALLOWED_CATEGORIES),
  content: z.string().min(1, 'Template content is required').max(10000),
  variables: z.array(z.string()).optional(),
  isActive: z.boolean().optional().default(true),
});

export type CreateTemplateBody = z.infer<typeof createTemplateSchema>;

// ---------------------------------------------------------------------------
// GET /api/communication/templates
// ---------------------------------------------------------------------------

/**
 * GET /api/communication/templates
 *
 * Query parameters:
 *   channel      — Filter by channel (whatsapp, sms, email)
 *   category     — Filter by category
 *   active_only  — Filter active only (default: true)
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

    // ── Parse filters ─────────────────────────────────────────────────────
    const { searchParams } = request.nextUrl;
    const channel = searchParams.get('channel') as TemplateChannel | null;
    const category = searchParams.get('category') as TemplateCategory | null;
    const activeOnly = searchParams.get('active_only') !== 'false';

    // ── Fetch templates ───────────────────────────────────────────────────
    const templates = getTenantTemplates(tenantId, {
      channel: channel ?? undefined,
      category: category ?? undefined,
      activeOnly,
    });

    return NextResponse.json(
      {
        success: true,
        data: templates,
        error: null,
        meta: {
          total: templates.length,
          filters: {
            channel: channel ?? null,
            category: category ?? null,
            activeOnly,
          },
        },
      },
      {
        status: 200,
        headers: { ...rateHeaders, 'X-Request-Id': requestId },
      },
    );
  } catch (error) {
    console.error('[api/communication/templates] GET error:', error);
    return NextResponse.json(
      { success: false, data: null, error: 'Internal server error', meta: null },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/communication/templates
// ---------------------------------------------------------------------------

/**
 * POST /api/communication/templates
 *
 * Creates a new message template for the tenant.
 *
 * Body: { name, channel, category, content, variables?, isActive? }
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

    // Role check: only admin/agent can create templates
    if (userRole && !['admin', 'agent', 'superadmin'].includes(userRole)) {
      return NextResponse.json(
        { success: false, data: null, error: 'Forbidden — insufficient permissions', meta: null },
        { status: 403 },
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
    const parsed = createTemplateSchema.safeParse(body);

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

    // ── Create template ───────────────────────────────────────────────────
    const template = createTemplate({
      tenantId,
      name: parsed.data.name,
      channel: parsed.data.channel,
      category: parsed.data.category,
      content: parsed.data.content,
      variables: parsed.data.variables,
      isActive: parsed.data.isActive,
    });

    // ── Audit log ─────────────────────────────────────────────────────────
    await auditLog({
      tenantId,
      userId,
      action: 'create',
      entityType: 'message_template',
      entityId: template.id,
      oldValues: null,
      newValues: {
        name: template.name,
        channel: template.channel,
        category: template.category,
        variableCount: template.variables.length,
      },
      ipAddress: request.headers.get('x-forwarded-for') ?? null,
      userAgent: request.headers.get('user-agent') ?? null,
      requestId,
    }).catch(() => {});

    return NextResponse.json(
      {
        success: true,
        data: template,
        error: null,
        meta: null,
      },
      {
        status: 201,
        headers: { ...rateHeaders, 'X-Request-Id': requestId },
      },
    );
  } catch (error) {
    console.error('[api/communication/templates] POST error:', error);
    return NextResponse.json(
      { success: false, data: null, error: 'Internal server error', meta: null },
      { status: 500 },
    );
  }
}
