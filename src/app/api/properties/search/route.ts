// ============================================================================
// EstateFlow CRM — Property Search API Route
// GET /api/properties/search — Full-text search across title, description, location
// Phase 2: Core CRM — Agent-2-2-API-Properties
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { authenticate } from '@/middleware';
import { withRateLimit, rateLimitResponse } from '@/lib/security/rateLimiter';
import { withTenantContext } from '@/lib/auth/withTenantContext';
import { canRead } from '@/lib/auth/permissions';
import { searchProperties } from '@/lib/properties/queries';
import type { PropertyTypeValue, AvailabilityStatusValue } from '@/lib/constants';
import { PROPERTY_TYPES, AVAILABILITY_STATUSES } from '@/lib/constants';

// ---------------------------------------------------------------------------
// Zod schema
// ---------------------------------------------------------------------------

const propertyTypeValues = Object.values(PROPERTY_TYPES) as [string, ...string[]];
const availabilityStatusValues = Object.values(AVAILABILITY_STATUSES) as [string, ...string[]];

const SearchQuerySchema = z.object({
  q: z.string().min(1, 'Search query is required').max(200),
  property_type: z.enum(propertyTypeValues as [PropertyTypeValue, ...PropertyTypeValue[]]).optional(),
  availability_status: z.enum(availabilityStatusValues as [AvailabilityStatusValue, ...AvailabilityStatusValue[]]).optional(),
  price_min: z.coerce.number().min(0).optional(),
  price_max: z.coerce.number().min(0).optional(),
  bedrooms: z.coerce.number().int().min(0).optional(),
});

// ---------------------------------------------------------------------------
// GET — Full-text search
// ---------------------------------------------------------------------------

/**
 * GET /api/properties/search?q=<query>&property_type=...&availability_status=...
 *
 * Required query param: q (search term)
 * Optional filters: property_type, availability_status, price_min, price_max, bedrooms
 *
 * Response: { success, data: PropertyRow[] }
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // ── Auth ───────────────────────────────────────────────────────────────
    const auth = await authenticate(request);
    if (!auth) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      );
    }

    // ── Permission check ───────────────────────────────────────────────────
    if (!canRead(auth.role, 'properties')) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: insufficient permissions' },
        { status: 403 },
      );
    }

    // ── Rate limit ─────────────────────────────────────────────────────────
    const { result: rlResult, headers: rlHeaders } = await withRateLimit(request, 'user', auth.userId);
    if (!rlResult.allowed) {
      return rateLimitResponse(rlResult);
    }

    // ── Parse query params ─────────────────────────────────────────────────
    const searchParams = Object.fromEntries(request.nextUrl.searchParams.entries());
    const parsed = SearchQuerySchema.safeParse(searchParams);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid search parameters',
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400, headers: rlHeaders },
      );
    }

    const { q, ...filters } = parsed.data;

    // ── Execute within tenant context ──────────────────────────────────────
    const result = await withTenantContext(
      auth.tenantId,
      auth.userId,
      auth.role,
      () => searchProperties(q, auth.tenantId, filters),
    );

    if (!result.success) {
      return NextResponse.json(result, { status: 500, headers: rlHeaders });
    }

    return NextResponse.json(result, {
      status: 200,
      headers: rlHeaders,
    });
  } catch (error) {
    console.error('[properties/search] GET error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
