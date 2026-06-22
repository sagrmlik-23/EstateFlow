// ============================================================================
// EstateFlow CRM — Document PDF Generation API
// GET /api/documents/[id]/pdf — Generate PDF from a document template
// Phase 6 — Documents, Forms, Tasks v1.0.0
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  getDocumentById,
  generatePDF,
  type DocumentTemplateType,
} from '@/lib/documents/queries';
import { withRateLimit } from '@/lib/security/rateLimiter';
import { withTenantContext } from '@/lib/auth/withTenantContext';
import type { UserRole } from '@/types/auth';

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const generatePDFSchema = z.object({
  template: z.enum(['agreement', 'mou', 'receipt', 'noc', 'booking_form']),
  data: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])),
  title: z.string().max(255).optional(),
});

// ---------------------------------------------------------------------------
// POST /api/documents/[id]/pdf
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await params;

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

    // Parse and validate body
    const body = await request.json();
    const parsed = generatePDFSchema.safeParse(body);

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

    // Verify document exists (optional — if using existing doc record)
    const document = await withTenantContext(
      tenantId,
      userId,
      userRole || 'agent',
      () => getDocumentById(id),
    );

    if (!document) {
      return NextResponse.json(
        { success: false, data: null, error: 'Document not found', meta: null },
        { status: 404 },
      );
    }

    // Generate PDF HTML from template
    const html = await withTenantContext(
      tenantId,
      userId,
      userRole || 'agent',
      () => generatePDF(parsed.data.template as DocumentTemplateType, parsed.data.data),
    );

    // Return HTML content that can be rendered to PDF client-side or via a service
    const filename = parsed.data.title
      ? `${parsed.data.title.replace(/[^a-zA-Z0-9_-]/g, '_')}.html`
      : `${parsed.data.template}_${id.slice(0, 8)}.html`;

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `inline; filename="${filename}"`,
        'X-Request-Id': requestId,
        ...rateHeaders,
      },
    });
  } catch (error) {
    console.error('[api/documents/:id/pdf] POST error:', error);
    return NextResponse.json(
      { success: false, data: null, error: 'Internal server error', meta: null },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// GET /api/documents/[id]/pdf — Preview a document template as HTML
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await params;

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

    const document = await withTenantContext(
      tenantId,
      userId,
      userRole || 'agent',
      () => getDocumentById(id),
    );

    if (!document) {
      return NextResponse.json(
        { success: false, data: null, error: 'Document not found', meta: null },
        { status: 404 },
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: document,
        error: null,
        meta: null,
      },
      {
        status: 200,
        headers: { ...rateHeaders, 'X-Request-Id': requestId },
      },
    );
  } catch (error) {
    console.error('[api/documents/:id/pdf] GET error:', error);
    return NextResponse.json(
      { success: false, data: null, error: 'Internal server error', meta: null },
      { status: 500 },
    );
  }
}
