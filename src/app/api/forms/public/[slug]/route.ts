// ============================================================================
// EstateFlow CRM — Public Form Submission API (No Auth Required)
// GET  /api/forms/public/[slug]  — Fetch active form by slug/ID for rendering
// POST /api/forms/public/[slug]  — Submit form response (public)
// Phase 6 — Documents, Forms, Tasks v1.0.0
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  getFormById,
  submitFormResponse,
} from '@/lib/forms/queries';
import { withRateLimit, extractClientIp } from '@/lib/security/rateLimiter';

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const submitResponseSchema = z.record(
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(z.string())]),
);

// ---------------------------------------------------------------------------
// GET /api/forms/public/[slug]
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  try {
    const { slug } = await params;

    const requestId = request.headers.get('x-session-id') || crypto.randomUUID();

    // Rate limit by IP
    const { result: rateResult, headers: rateHeaders } = await withRateLimit(
      request,
      'ip',
    );
    if (!rateResult.allowed) {
      return NextResponse.json(
        { success: false, data: null, error: 'Too many requests', meta: null },
        { status: 429, headers: rateHeaders },
      );
    }

    // The slug can be a form ID (UUID) or a form slug/name lookup
    // For MVP, we treat the slug as the form ID directly
    const form = await getFormById(slug);

    if (!form) {
      return NextResponse.json(
        { success: false, data: null, error: 'Form not found', meta: null },
        { status: 404 },
      );
    }

    if (!form.is_active) {
      return NextResponse.json(
        { success: false, data: null, error: 'This form is no longer accepting submissions', meta: null },
        { status: 410 },
      );
    }

    // Return only public-safe fields (no tenant_id, created_by, etc.)
    const publicForm = {
      id: form.id,
      name: form.name,
      description: form.description,
      form_fields: form.form_fields.map((f) => ({
        id: f.id,
        type: f.type,
        label: f.label,
        placeholder: f.placeholder,
        required: f.required,
        options: f.options,
        validation: f.validation,
        order: f.order,
      })),
      submit_button_text: form.submit_button_text,
      success_message: form.success_message,
    };

    return NextResponse.json(
      {
        success: true,
        data: publicForm,
        error: null,
        meta: null,
      },
      {
        status: 200,
        headers: { ...rateHeaders, 'X-Request-Id': requestId },
      },
    );
  } catch (error) {
    console.error('[api/forms/public/:slug] GET error:', error);
    return NextResponse.json(
      { success: false, data: null, error: 'Internal server error', meta: null },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/forms/public/[slug]
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  try {
    const { slug } = await params;

    const requestId = request.headers.get('x-session-id') || crypto.randomUUID();
    const clientIp = extractClientIp(request);
    const userAgent = request.headers.get('user-agent') || null;

    // Rate limit by IP (stricter for POST)
    const { result: rateResult, headers: rateHeaders } = await withRateLimit(
      request,
      'ip',
    );
    if (!rateResult.allowed) {
      return NextResponse.json(
        { success: false, data: null, error: 'Too many requests', meta: null },
        { status: 429, headers: rateHeaders },
      );
    }

    // Parse body
    const body = await request.json();
    const parsed = submitResponseSchema.safeParse(body);

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

    // Submit the form response
    const result = await submitFormResponse(slug, parsed.data, {
      ipAddress: clientIp,
      userAgent,
    });

    return NextResponse.json(
      {
        success: true,
        data: result,
        error: null,
        meta: null,
      },
      {
        status: 201,
        headers: { ...rateHeaders, 'X-Request-Id': requestId },
      },
    );
  } catch (error) {
    // Handle known errors from the query layer
    const message = error instanceof Error ? error.message : 'Internal server error';
    const status = message.includes('not found') ? 404
      : message.includes('required') || message.includes('Invalid') || message.includes('accepting') ? 400
      : 500;

    console.error('[api/forms/public/:slug] POST error:', error);
    return NextResponse.json(
      { success: false, data: null, error: message, meta: null },
      { status },
    );
  }
}
