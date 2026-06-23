// ============================================================================
// EstateFlow CRM — Single Document CRUD API
// GET    /api/documents/[id]  — Get document details
// PATCH  /api/documents/[id]  — Update document metadata
// DELETE /api/documents/[id]  — Delete a document
// Phase 6 — Documents, Forms, Tasks v1.0.0
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  getDocumentById,
  updateDocument,
  deleteDocument,
} from '@/lib/documents/queries';
import { withRateLimit, extractClientIp } from '@/lib/security/rateLimiter';
import { logUpdate, logDelete } from '@/lib/security/auditLogger';
import { withTenantContext } from '@/lib/auth/withTenantContext';
import type { UserRole } from '@/types/auth';

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const IdParamsSchema = z.object({
  id: z.string().uuid('Invalid document ID format'),
});

const ALLOWED_CATEGORIES = [
  'contract', 'agreement', 'id_proof', 'property_doc', 'other',
] as const;

const updateDocumentSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  category: z.enum(ALLOWED_CATEGORIES).nullable().optional(),
  file_type: z.string().max(50).nullable().optional(),
  file_size: z.number().int().nonnegative().nullable().optional(),
  storage_url: z.string().max(2048).optional(),
});

export type UpdateDocumentBody = z.infer<typeof updateDocumentSchema>;

// ---------------------------------------------------------------------------
// GET /api/documents/[id]
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await params;

    // ── Validate param ─────────────────────────────────────────────────────
    const paramResult = IdParamsSchema.safeParse({ id });
    if (!paramResult.success) {
      return NextResponse.json(
        { success: false, data: null, error: 'Invalid document ID', meta: null },
        { status: 400 },
      );
    }

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

    const doc = await withTenantContext(
      tenantId,
      userId,
      userRole || 'agent',
      () => getDocumentById(id),
    );

    if (!doc) {
      return NextResponse.json(
        { success: false, data: null, error: 'Document not found', meta: null },
        { status: 404 },
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: doc,
        error: null,
        meta: null,
      },
      {
        status: 200,
        headers: { ...rateHeaders, 'Cache-Control': 'private, no-store', 'X-Request-Id': requestId },
      },
    );
  } catch (error) {
    console.error('[api/documents/:id] GET error:', error);
    return NextResponse.json(
      { success: false, data: null, error: 'Internal server error', meta: null },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/documents/[id]
// ---------------------------------------------------------------------------

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await params;

    // ── Validate param ─────────────────────────────────────────────────────
    const paramResult = IdParamsSchema.safeParse({ id });
    if (!paramResult.success) {
      return NextResponse.json(
        { success: false, data: null, error: 'Invalid document ID', meta: null },
        { status: 400 },
      );
    }

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
    const parsed = updateDocumentSchema.safeParse(body);

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

    if (Object.keys(parsed.data).length === 0) {
      return NextResponse.json(
        { success: false, data: null, error: 'No fields provided to update', meta: null },
        { status: 400 },
      );
    }

    const oldDoc = await withTenantContext(
      tenantId,
      userId,
      userRole || 'agent',
      () => getDocumentById(id),
    );

    if (!oldDoc) {
      return NextResponse.json(
        { success: false, data: null, error: 'Document not found', meta: null },
        { status: 404 },
      );
    }

    // Convert null values to undefined to match UpdateDocumentInput types
    const updateData: Record<string, unknown> = { ...parsed.data };
    for (const key of Object.keys(updateData)) {
      if (updateData[key] === null) {
        updateData[key] = undefined;
      }
    }

    const updatedDoc = await withTenantContext(
      tenantId,
      userId,
      userRole || 'agent',
      () => updateDocument(id, updateData as Parameters<typeof updateDocument>[1]),
    );

    const changedFields: Record<string, unknown> = {};
    for (const key of Object.keys(parsed.data)) {
      const oldVal = (oldDoc as unknown as Record<string, unknown>)[key];
      const newVal = (parsed.data as Record<string, unknown>)[key];
      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        changedFields[key] = { from: oldVal, to: newVal };
      }
    }

    await logUpdate(
      'document',
      id,
      { ...changedFields },
      { ipAddress: clientIp, userAgent, requestId },
    );

    return NextResponse.json(
      {
        success: true,
        data: updatedDoc,
        error: null,
        meta: null,
      },
      {
        status: 200,
        headers: { ...rateHeaders, 'Cache-Control': 'private, no-store', 'X-Request-Id': requestId },
      },
    );
  } catch (error) {
    console.error('[api/documents/:id] PATCH error:', error);
    return NextResponse.json(
      { success: false, data: null, error: 'Internal server error', meta: null },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/documents/[id]
// ---------------------------------------------------------------------------

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await params;

    // ── Validate param ─────────────────────────────────────────────────────
    const paramResult = IdParamsSchema.safeParse({ id });
    if (!paramResult.success) {
      return NextResponse.json(
        { success: false, data: null, error: 'Invalid document ID', meta: null },
        { status: 400 },
      );
    }

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

    const doc = await withTenantContext(
      tenantId,
      userId,
      userRole || 'agent',
      () => getDocumentById(id),
    );

    if (!doc) {
      return NextResponse.json(
        { success: false, data: null, error: 'Document not found', meta: null },
        { status: 404 },
      );
    }

    await withTenantContext(
      tenantId,
      userId,
      userRole || 'agent',
      () => deleteDocument(id),
    );

    await logDelete(
      'document',
      id,
      { name: doc.name, category: doc.category },
      { ipAddress: clientIp, userAgent, requestId },
    );

    return NextResponse.json(
      {
        success: true,
        data: { id, deleted: true },
        error: null,
        meta: null,
      },
      {
        status: 200,
        headers: { ...rateHeaders, 'Cache-Control': 'private, no-store', 'X-Request-Id': requestId },
      },
    );
  } catch (error) {
    console.error('[api/documents/:id] DELETE error:', error);
    return NextResponse.json(
      { success: false, data: null, error: 'Internal server error', meta: null },
      { status: 500 },
    );
  }
}
