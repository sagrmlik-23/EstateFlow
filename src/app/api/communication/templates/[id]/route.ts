// ============================================================================
// EstateFlow CRM — Single Template API
// GET    /api/communication/templates/[id] — Get template
// PATCH  /api/communication/templates/[id] — Update template
// DELETE /api/communication/templates/[id] — Delete template
// Phase 4 — Communication (AGENT-4-4-TEMPLATES-SHARING)
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  getTemplateById,
  updateTemplate,
  deleteTemplate,
} from '@/lib/communication/templates';
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

const updateTemplateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  channel: z.enum(ALLOWED_CHANNELS).optional(),
  category: z.enum(ALLOWED_CATEGORIES).optional(),
  content: z.string().min(1).max(10000).optional(),
  variables: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// Route params
// ---------------------------------------------------------------------------

interface RouteParams {
  params: Promise<{ id: string }>;
}

// ---------------------------------------------------------------------------
// GET /api/communication/templates/[id]
// ---------------------------------------------------------------------------

/**
 * GET /api/communication/templates/[id]
 *
 * Returns a single template by ID.
 */
export async function GET(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  try {
    const { id } = await params;

    // ── Auth ──────────────────────────────────────────────────────────────
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

    // ── Fetch template ─────────────────────────────────────────────────────
    const template = getTemplateById(id);

    if (!template) {
      return NextResponse.json(
        { success: false, data: null, error: 'Template not found', meta: null },
        { status: 404, headers: { ...rateHeaders, 'X-Request-Id': requestId } },
      );
    }

    // Tenant isolation: system templates (tenantId === null) are visible to all
    if (template.tenantId !== null && template.tenantId !== tenantId) {
      return NextResponse.json(
        { success: false, data: null, error: 'Template not found for this tenant', meta: null },
        { status: 404, headers: { ...rateHeaders, 'X-Request-Id': requestId } },
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: template,
        error: null,
        meta: null,
      },
      {
        status: 200,
        headers: { ...rateHeaders, 'X-Request-Id': requestId },
      },
    );
  } catch (error) {
    console.error('[api/communication/templates/:id] GET error:', error);
    return NextResponse.json(
      { success: false, data: null, error: 'Internal server error', meta: null },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/communication/templates/[id]
// ---------------------------------------------------------------------------

/**
 * PATCH /api/communication/templates/[id]
 *
 * Updates a message template. System templates (tenantId === null) cannot
 * be modified.
 */
export async function PATCH(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  try {
    const { id } = await params;

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

    // Role check
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

    // ── Check template exists ──────────────────────────────────────────────
    const existing = getTemplateById(id);
    if (!existing) {
      return NextResponse.json(
        { success: false, data: null, error: 'Template not found', meta: null },
        { status: 404, headers: { ...rateHeaders, 'X-Request-Id': requestId } },
      );
    }

    // Protect system templates
    if (existing.tenantId === null) {
      return NextResponse.json(
        { success: false, data: null, error: 'System templates cannot be modified. Create a tenant-specific override instead.', meta: null },
        { status: 403, headers: { ...rateHeaders, 'X-Request-Id': requestId } },
      );
    }

    // Tenant isolation
    if (existing.tenantId !== tenantId) {
      return NextResponse.json(
        { success: false, data: null, error: 'Template not found for this tenant', meta: null },
        { status: 404, headers: { ...rateHeaders, 'X-Request-Id': requestId } },
      );
    }

    // ── Parse & validate ──────────────────────────────────────────────────
    const body = await request.json();
    const parsed = updateTemplateSchema.safeParse(body);

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

    // ── Update template ───────────────────────────────────────────────────
    const updated = updateTemplate(id, parsed.data);

    if (!updated) {
      return NextResponse.json(
        { success: false, data: null, error: 'Template not found', meta: null },
        { status: 404, headers: { ...rateHeaders, 'X-Request-Id': requestId } },
      );
    }

    // ── Audit log ─────────────────────────────────────────────────────────
    await auditLog({
      tenantId,
      userId,
      action: 'update',
      entityType: 'message_template',
      entityId: id,
      oldValues: {
        name: existing.name,
        channel: existing.channel,
        category: existing.category,
        isActive: existing.isActive,
      },
      newValues: {
        name: updated.name,
        channel: updated.channel,
        category: updated.category,
        isActive: updated.isActive,
      },
      ipAddress: request.headers.get('x-forwarded-for') ?? null,
      userAgent: request.headers.get('user-agent') ?? null,
      requestId,
    }).catch(() => {});

    return NextResponse.json(
      {
        success: true,
        data: updated,
        error: null,
        meta: null,
      },
      {
        status: 200,
        headers: { ...rateHeaders, 'X-Request-Id': requestId },
      },
    );
  } catch (error) {
    console.error('[api/communication/templates/:id] PATCH error:', error);
    return NextResponse.json(
      { success: false, data: null, error: 'Internal server error', meta: null },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/communication/templates/[id]
// ---------------------------------------------------------------------------

/**
 * DELETE /api/communication/templates/[id]
 *
 * Deletes a tenant-specific template. System templates cannot be deleted.
 */
export async function DELETE(
  request: NextRequest,
  { params }: RouteParams,
): Promise<NextResponse> {
  try {
    const { id } = await params;

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

    // Role check
    if (userRole && !['admin', 'superadmin'].includes(userRole)) {
      return NextResponse.json(
        { success: false, data: null, error: 'Forbidden — only admins can delete templates', meta: null },
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

    // ── Check template exists ──────────────────────────────────────────────
    const existing = getTemplateById(id);
    if (!existing) {
      return NextResponse.json(
        { success: false, data: null, error: 'Template not found', meta: null },
        { status: 404, headers: { ...rateHeaders, 'X-Request-Id': requestId } },
      );
    }

    // Protect system templates
    if (existing.tenantId === null) {
      return NextResponse.json(
        { success: false, data: null, error: 'System templates cannot be deleted', meta: null },
        { status: 403, headers: { ...rateHeaders, 'X-Request-Id': requestId } },
      );
    }

    // Tenant isolation
    if (existing.tenantId !== tenantId) {
      return NextResponse.json(
        { success: false, data: null, error: 'Template not found for this tenant', meta: null },
        { status: 404, headers: { ...rateHeaders, 'X-Request-Id': requestId } },
      );
    }

    // ── Delete template ───────────────────────────────────────────────────
    const deleted = deleteTemplate(id);

    if (!deleted) {
      return NextResponse.json(
        { success: false, data: null, error: 'Failed to delete template', meta: null },
        { status: 500, headers: { ...rateHeaders, 'X-Request-Id': requestId } },
      );
    }

    // ── Audit log ─────────────────────────────────────────────────────────
    await auditLog({
      tenantId,
      userId,
      action: 'delete',
      entityType: 'message_template',
      entityId: id,
      oldValues: {
        name: existing.name,
        channel: existing.channel,
        category: existing.category,
      },
      newValues: null,
      ipAddress: request.headers.get('x-forwarded-for') ?? null,
      userAgent: request.headers.get('user-agent') ?? null,
      requestId,
    }).catch(() => {});

    return NextResponse.json(
      {
        success: true,
        data: null,
        error: null,
        meta: null,
      },
      {
        status: 200,
        headers: { ...rateHeaders, 'X-Request-Id': requestId },
      },
    );
  } catch (error) {
    console.error('[api/communication/templates/:id] DELETE error:', error);
    return NextResponse.json(
      { success: false, data: null, error: 'Internal server error', meta: null },
      { status: 500 },
    );
  }
}
