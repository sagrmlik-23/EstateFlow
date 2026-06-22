// ============================================================================
// EstateFlow CRM — Duplicate Lead Detection API
// GET /api/leads/duplicates?phone=...
// Find leads matching by phone number
// Agent-2-1-API-Leads v1.0.0
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getDuplicateLeads } from '@/lib/leads/queries';
import { withRateLimit } from '@/lib/security/rateLimiter';
import { withTenantContext } from '@/lib/auth/withTenantContext';
import type { UserRole } from '@/types/auth';

// ---------------------------------------------------------------------------
// Zod schema for query validation
// ---------------------------------------------------------------------------

const duplicateQuerySchema = z.object({
  phone: z.string().min(5, 'Phone number is required (min 5 characters)').max(20),
});

// ---------------------------------------------------------------------------
// GET /api/leads/duplicates?phone=+919876543210
// ---------------------------------------------------------------------------

/**
 * GET /api/leads/duplicates?phone=<phone>
 *
 * Finds leads that have the same phone number (normalized comparison).
 * Compares by decrypting stored phone values and normalizing digits.
 *
 * Query parameters:
 *   phone — Phone number to search (required)
 *
 * Response:
 * {
 *   success: true,
 *   data: LeadRow[],
 *   error: null,
 *   meta: { total: number }
 * }
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
    const parsed = duplicateQuerySchema.safeParse({
      phone: searchParams.get('phone') || '',
    });

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

    // ── Execute ────────────────────────────────────────────────────────────
    const duplicates = await withTenantContext(
      tenantId,
      userId,
      userRole || 'agent',
      () => getDuplicateLeads(parsed.data.phone, tenantId),
    );

    return NextResponse.json(
      {
        success: true,
        data: duplicates,
        error: null,
        meta: { total: duplicates.length },
      },
      {
        status: 200,
        headers: { ...rateHeaders, 'X-Request-Id': requestId },
      },
    );
  } catch (error) {
    console.error('[api/leads/duplicates] GET error:', error);
    return NextResponse.json(
      { success: false, data: null, error: 'Internal server error', meta: null },
      { status: 500 },
    );
  }
}
