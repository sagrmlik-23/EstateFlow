// ============================================================================
// EstateFlow CRM — Form Builder CRUD API
// GET  /api/forms    — List forms with pagination
// POST /api/forms    — Create a new form
// Phase 6 — Documents, Forms, Tasks v1.0.0
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { buildPaginationParams } from '@/lib/types';
import {
  getForms,
  createForm,
  FORM_FIELD_TYPES,
} from '@/lib/forms/queries';
import { withRateLimit, extractClientIp } from '@/lib/security/rateLimiter';
import { logCreate } from '@/lib/security/auditLogger';
import { withTenantContext } from '@/lib/auth/withTenantContext';
import type { UserRole } from '@/types/auth';

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const formFieldSchema = z.object({
  id: z.string().optional(),
  type: z.enum(FORM_FIELD_TYPES),
  label: z.string().min(1, 'Field label is required'),
  placeholder: z.string().optional(),
  required: z.boolean().optional().default(false),
  options: z.array(z.string()).optional(),
  validation: z.object({
    min: z.number().optional(),
    max: z.number().optional(),
    pattern: z.string().optional(),
    message: z.string().optional(),
  }).optional(),
  order: z.number().int().nonnegative(),
});

const formSettingsSchema = z.object({
  redirect_url: z.string().url().optional(),
  collect_ip: z.boolean().optional(),
  collect_user_agent: z.boolean().optional(),
  email_notifications: z.array(z.string().email()).optional(),
  webhook_url: z.string().url().optional(),
  captcha_enabled: z.boolean().optional(),
  limit_submissions: z.number().int().positive().optional(),
  allow_duplicate: z.boolean().optional(),
}).optional();

const createFormSchema = z.object({
  name: z.string().min(1, 'Form name is required').max(255),
  description: z.string().max(2000).nullable().optional(),
  fields: z.array(formFieldSchema).min(1, 'At least one field is required'),
  settings: formSettingsSchema,
  submit_button_text: z.string().max(100).optional().default('Submit'),
  success_message: z.string().max(500).optional().default('Thank you for your submission.'),
});

export type CreateFormBody = z.infer<typeof createFormSchema>;

// ---------------------------------------------------------------------------
// GET /api/forms
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
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

    const { searchParams } = request.nextUrl;
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const pagination = buildPaginationParams(page, limit);

    const filters: Record<string, unknown> = {};
    const isActive = searchParams.get('is_active');
    if (isActive === 'true') filters.is_active = true;
    if (isActive === 'false') filters.is_active = false;

    const result = await withTenantContext(
      tenantId,
      userId,
      userRole || 'agent',
      () => getForms(tenantId, filters, pagination),
    );

    return NextResponse.json(
      {
        success: true,
        data: result.data,
        error: null,
        meta: result.meta,
      },
      {
        status: 200,
        headers: { ...rateHeaders, 'X-Request-Id': requestId },
      },
    );
  } catch (error) {
    console.error('[api/forms] GET error:', error);
    return NextResponse.json(
      { success: false, data: null, error: 'Internal server error', meta: null },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/forms
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const userId = request.headers.get('x-user-id');
    const tenantId = request.headers.get('x-tenant-id');
    const userRole = request.headers.get('x-user-role') as UserRole | null;
    const requestId = request.headers.get('x-session-id') || crypto.randomUUID();
    const clientIp = extractClientIp(request);
    const userAgent = request.headers.get('user-agent') || null;

    if (!userId || !tenantId) {
      return NextResponse.json(
        { success: false, data: null, error: 'Unauthorized — missing auth headers', meta: null },
        { status: 401 },
      );
    }

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

    const body = await request.json();
    const parsed = createFormSchema.safeParse(body);

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

    const form = await withTenantContext(
      tenantId,
      userId,
      userRole || 'agent',
      () => createForm(tenantId, parsed.data, userId),
    );

    await logCreate(
      'form',
      form.id,
      { name: form.name, field_count: form.form_fields.length },
      { ipAddress: clientIp, userAgent, requestId },
    );

    return NextResponse.json(
      {
        success: true,
        data: form,
        error: null,
        meta: null,
      },
      {
        status: 201,
        headers: { ...rateHeaders, 'X-Request-Id': requestId },
      },
    );
  } catch (error) {
    console.error('[api/forms] POST error:', error);
    return NextResponse.json(
      { success: false, data: null, error: 'Internal server error', meta: null },
      { status: 500 },
    );
  }
}
