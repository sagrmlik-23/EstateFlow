// ============================================================================
// EstateFlow CRM — Form Responses API
// GET /api/forms/[id]/responses — View form submissions (paginated)
// Phase 6 — Documents, Forms, Tasks v1.0.0
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { buildPaginationParams } from '@/lib/types';
import { getFormResponses, getFormById } from '@/lib/forms/queries';
import { withRateLimit } from '@/lib/security/rateLimiter';
import { withTenantContext } from '@/lib/auth/withTenantContext';
import type { UserRole } from '@/types/auth';

// ---------------------------------------------------------------------------
// GET /api/forms/[id]/responses
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id: formId } = await params;

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

    // Verify form exists and belongs to tenant
    const form = await withTenantContext(
      tenantId,
      userId,
      userRole || 'agent',
      () => getFormById(formId),
    );

    if (!form) {
      return NextResponse.json(
        { success: false, data: null, error: 'Form not found', meta: null },
        { status: 404 },
      );
    }

    const { searchParams } = request.nextUrl;
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const pagination = buildPaginationParams(page, limit);

    const result = await withTenantContext(
      tenantId,
      userId,
      userRole || 'agent',
      () => getFormResponses(formId, pagination),
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
    console.error('[api/forms/:id/responses] GET error:', error);
    return NextResponse.json(
      { success: false, data: null, error: 'Internal server error', meta: null },
      { status: 500 },
    );
  }
}
