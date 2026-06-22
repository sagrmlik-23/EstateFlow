// ============================================================================
// EstateFlow CRM — Lead Search API
// GET /api/leads/search?q=...&page=1&limit=20
// Full-text search across name, phone, email, notes
// Agent-2-1-API-Leads v1.0.0
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { buildPaginationParams } from '@/lib/types';
import { searchLeads } from '@/lib/leads/queries';
import { withRateLimit } from '@/lib/security/rateLimiter';
import { withTenantContext } from '@/lib/auth/withTenantContext';
import type { UserRole } from '@/types/auth';

// ---------------------------------------------------------------------------
// GET /api/leads/search?q=john&page=1&limit=20
// ---------------------------------------------------------------------------

/**
 * GET /api/leads/search?q=<query>&page=1&limit=20
 *
 * Full-text search across lead fields: full_name, phone, email, notes, source, preferred_location.
 *
 * Query parameters:
 *   q       — Search term (required, min 2 characters)
 *   page    — Page number (default: 1)
 *   limit   — Items per page (default: 20, max: 100)
 *
 * Response: Paginated list of matching leads
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // ── Auth headers ───────────────────────────────────────────────────────
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

    // ── Parse query ────────────────────────────────────────────────────────
    const { searchParams } = request.nextUrl;
    const query = searchParams.get('q')?.trim();

    if (!query || query.length < 2) {
      return NextResponse.json(
        { success: false, data: null, error: 'Search query "q" is required and must be at least 2 characters', meta: null },
        { status: 400 },
      );
    }

    // Sanitize: remove special characters that could break ilike patterns
    const sanitizedQuery = query.replace(/[%_]/g, '').slice(0, 100);

    if (!sanitizedQuery || sanitizedQuery.length < 2) {
      return NextResponse.json(
        { success: false, data: null, error: 'Search query contains only special characters', meta: null },
        { status: 400 },
      );
    }

    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const pagination = buildPaginationParams(page, limit);

    // ── Execute search ─────────────────────────────────────────────────────
    const result = await withTenantContext(
      tenantId,
      userId,
      userRole || 'agent',
      () => searchLeads(sanitizedQuery, tenantId, pagination),
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
    console.error('[api/leads/search] GET error:', error);
    return NextResponse.json(
      { success: false, data: null, error: 'Internal server error', meta: null },
      { status: 500 },
    );
  }
}
