// ============================================================================
// EstateFlow CRM — Properties API Route (List + Create)
// GET  /api/properties — List properties with filters and pagination
// POST /api/properties — Create a new property
// Phase 2: Core CRM — Agent-2-2-API-Properties
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { authenticate } from '@/middleware';
import { withRateLimit, rateLimitResponse } from '@/lib/security/rateLimiter';
import { logCreate } from '@/lib/security/auditLogger';
import { withTenantContext } from '@/lib/auth/withTenantContext';
import { canCreate, canRead } from '@/lib/auth/permissions';
import { buildPaginationParams } from '@/lib/types';
import {
  getProperties,
  createProperty,
} from '@/lib/properties/queries';
import type { PropertyTypeValue, AvailabilityStatusValue } from '@/lib/constants';
import { PROPERTY_TYPES, AVAILABILITY_STATUSES } from '@/lib/constants';

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const propertyTypeValues = Object.values(PROPERTY_TYPES) as [string, ...string[]];
const availabilityStatusValues = Object.values(AVAILABILITY_STATUSES) as [string, ...string[]];

const PropertyFilterSchema = z.object({
  property_type: z.enum(propertyTypeValues as [PropertyTypeValue, ...PropertyTypeValue[]]).optional(),
  availability_status: z.enum(availabilityStatusValues as [AvailabilityStatusValue, ...AvailabilityStatusValue[]]).optional(),
  price_min: z.coerce.number().min(0).optional(),
  price_max: z.coerce.number().min(0).optional(),
  bedrooms: z.coerce.number().int().min(0).optional(),
  bathrooms: z.coerce.number().int().min(0).optional(),
  area_min: z.coerce.number().min(0).optional(),
  area_max: z.coerce.number().min(0).optional(),
  location: z.string().max(200).optional(),
  amenities: z
    .union([z.string(), z.array(z.string())])
    .transform((val) => (typeof val === 'string' ? val.split(',').map((a) => a.trim()).filter(Boolean) : val))
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const CreatePropertySchema = z.object({
  title: z.string().min(1, 'Title is required').max(200),
  description: z.string().max(2000).nullable().optional(),
  price: z.number().min(0, 'Price must be non-negative'),
  area_sqft: z.number().min(0).nullable().optional(),
  bedrooms: z.number().int().min(0).nullable().optional(),
  bathrooms: z.number().int().min(0).nullable().optional(),
  property_type: z.enum(propertyTypeValues as [PropertyTypeValue, ...PropertyTypeValue[]], {
    errorMap: () => ({ message: `Invalid property type. Must be one of: ${propertyTypeValues.join(', ')}` }),
  }),
  availability_status: z
    .enum(availabilityStatusValues as [AvailabilityStatusValue, ...AvailabilityStatusValue[]])
    .default('available'),
  location: z.string().max(500).nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  images: z.array(z.string().url()).nullable().optional(),
  amenities: z.array(z.string().max(100)).nullable().optional(),
  owner_name: z.string().max(200).nullable().optional(),
  owner_phone: z.string().max(20).nullable().optional(),
});

// ---------------------------------------------------------------------------
// GET — List properties with filters and pagination
// ---------------------------------------------------------------------------

/**
 * GET /api/properties
 *
 * Query params:
 *   property_type, availability_status, price_min, price_max,
 *   bedrooms, bathrooms, area_min, area_max, location, amenities,
 *   page, limit
 *
 * Response: { success, data: PropertyRow[], meta: PaginationMeta }
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

    // ── Parse & validate query params ──────────────────────────────────────
    const searchParams = Object.fromEntries(request.nextUrl.searchParams.entries());
    const parsed = PropertyFilterSchema.safeParse(searchParams);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid query parameters',
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400, headers: rlHeaders },
      );
    }

    const filters = parsed.data;
    const pagination = buildPaginationParams(filters.page, filters.limit);

    // ── Execute within tenant context ──────────────────────────────────────
    const result = await withTenantContext(
      auth.tenantId,
      auth.userId,
      auth.role,
      () => getProperties(auth.tenantId, filters, pagination),
    );

    if (!result.success) {
      return NextResponse.json(result, { status: 500, headers: rlHeaders });
    }

    return NextResponse.json(result, {
      status: 200,
      headers: rlHeaders,
    });
  } catch (error) {
    console.error('[properties] GET error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST — Create a new property
// ---------------------------------------------------------------------------

/**
 * POST /api/properties
 *
 * Body: CreatePropertyInput
 * Response: { success, data: PropertyRow }
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
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
    if (!canCreate(auth.role, 'properties')) {
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

    // ── Parse body ─────────────────────────────────────────────────────────
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON body' },
        { status: 400, headers: rlHeaders },
      );
    }

    const parsed = CreatePropertySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Validation failed',
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400, headers: rlHeaders },
      );
    }

    // ── Execute within tenant context ──────────────────────────────────────
    const result = await withTenantContext(
      auth.tenantId,
      auth.userId,
      auth.role,
      () => createProperty(auth.tenantId, parsed.data),
    );

    if (!result.success) {
      return NextResponse.json(result, { status: 500, headers: rlHeaders });
    }

    // ── Audit log ──────────────────────────────────────────────────────────
    if (result.data) {
      await logCreate(
        'property',
        result.data.id,
        parsed.data as unknown as Record<string, unknown>,
        {
          ipAddress: request.headers.get('x-forwarded-for') ?? null,
          userAgent: request.headers.get('user-agent') ?? null,
          requestId: request.headers.get('x-session-id') ?? null,
        },
      );
    }

    return NextResponse.json(result, {
      status: 201,
      headers: rlHeaders,
    });
  } catch (error) {
    console.error('[properties] POST error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
