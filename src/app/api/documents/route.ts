// ============================================================================
// EstateFlow CRM — Document CRUD API
// GET    /api/documents    — List documents with filters & pagination
// POST   /api/documents    — Create a document record
// Phase 6 — Documents, Forms, Tasks v1.0.0
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { buildPaginationParams } from '@/lib/types';
import {
  getDocuments,
  createDocument,
  getDocumentTemplates,
} from '@/lib/documents/queries';
import { withRateLimit, extractClientIp } from '@/lib/security/rateLimiter';
import { logCreate } from '@/lib/security/auditLogger';
import { withTenantContext } from '@/lib/auth/withTenantContext';
import type { UserRole } from '@/types/auth';

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const ALLOWED_CATEGORIES = [
  'contract', 'agreement', 'id_proof', 'property_doc', 'other',
] as const;

const createDocumentSchema = z.object({
  title: z.string().min(1, 'Title is required').max(255),
  name: z.string().max(255).optional(),
  lead_id: z.string().uuid().nullable().optional(),
  deal_id: z.string().uuid().nullable().optional(),
  property_id: z.string().uuid().nullable().optional(),
  file_type: z.string().max(50).nullable().optional(),
  file_size: z.number().int().nonnegative().nullable().optional(),
  storage_url: z.string().max(2048).optional().default(''),
  category: z.enum(ALLOWED_CATEGORIES).nullable().optional(),
});

export type CreateDocumentBody = z.infer<typeof createDocumentSchema>;

// ---------------------------------------------------------------------------
// GET /api/documents
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

    const filters: Record<string, string> = {};
    const category = searchParams.get('category');
    if (category && (ALLOWED_CATEGORIES as readonly string[]).includes(category)) {
      filters.category = category;
    }
    if (searchParams.get('lead_id')) filters.lead_id = searchParams.get('lead_id')!;
    if (searchParams.get('deal_id')) filters.deal_id = searchParams.get('deal_id')!;
    if (searchParams.get('property_id')) filters.property_id = searchParams.get('property_id')!;

    const templates = searchParams.get('templates') === 'true';
    if (templates) {
      const docTemplates = getDocumentTemplates();
      return NextResponse.json({
        success: true,
        data: docTemplates,
        error: null,
        meta: null,
      });
    }

    const result = await withTenantContext(
      tenantId,
      userId,
      userRole || 'agent',
      () => getDocuments(tenantId, filters, pagination),
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
    console.error('[api/documents] GET error:', error);
    return NextResponse.json(
      { success: false, data: null, error: 'Internal server error', meta: null },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/documents
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
    const parsed = createDocumentSchema.safeParse(body);

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

    // Convert null values to undefined to match CreateDocumentInput types
    const createData: Record<string, unknown> = { ...parsed.data };
    for (const key of Object.keys(createData)) {
      if (createData[key] === null) {
        createData[key] = undefined;
      }
    }

    const doc = await withTenantContext(
      tenantId,
      userId,
      userRole || 'agent',
      () => createDocument(tenantId, createData as unknown as Parameters<typeof createDocument>[1], userId),
    );

    await logCreate(
      'document',
      doc.id,
      { name: doc.name, category: doc.category },
      { ipAddress: clientIp, userAgent, requestId },
    );

    return NextResponse.json(
      {
        success: true,
        data: doc,
        error: null,
        meta: null,
      },
      {
        status: 201,
        headers: { ...rateHeaders, 'X-Request-Id': requestId },
      },
    );
  } catch (error) {
    console.error('[api/documents] POST error:', error);
    return NextResponse.json(
      { success: false, data: null, error: 'Internal server error', meta: null },
      { status: 500 },
    );
  }
}
