// ============================================================================
// EstateFlow CRM — Single Property API Route
// GET    /api/properties/[id] — Get a single property
// PATCH  /api/properties/[id] — Update a property
// DELETE /api/properties/[id] — Delete/archive a property
// Phase 2: Core CRM — Agent-2-2-API-Properties
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { authenticate } from '@/middleware';
import { withRateLimit, rateLimitResponse } from '@/lib/security/rateLimiter';
import { logUpdate, logDelete } from '@/lib/security/auditLogger';
import { withTenantContext } from '@/lib/auth/withTenantContext';
import { canRead, canUpdate, canDelete } from '@/lib/auth/permissions';
import {
  getPropertyById,
  updateProperty,
  deleteProperty,
} from '@/lib/properties/queries';
import type { PropertyTypeValue, AvailabilityStatusValue } from '@/lib/constants';
import { PROPERTY_TYPES, AVAILABILITY_STATUSES } from '@/lib/constants';

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const propertyTypeValues = Object.values(PROPERTY_TYPES) as [string, ...string[]];
const availabilityStatusValues = Object.values(AVAILABILITY_STATUSES) as [string, ...string[]];

const UpdatePropertySchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  price: z.number().min(0).optional(),
  area_sqft: z.number().min(0).nullable().optional(),
  bedrooms: z.number().int().min(0).nullable().optional(),
  bathrooms: z.number().int().min(0).nullable().optional(),
  property_type: z
    .enum(propertyTypeValues as [PropertyTypeValue, ...PropertyTypeValue[]])
    .optional(),
  availability_status: z
    .enum(availabilityStatusValues as [AvailabilityStatusValue, ...AvailabilityStatusValue[]])
    .optional(),
  location: z.string().max(500).nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  images: z.array(z.string().url()).nullable().optional(),
  amenities: z.array(z.string().max(100)).nullable().optional(),
  owner_name: z.string().max(200).nullable().optional(),
  owner_phone: z.string().max(20).nullable().optional(),
});

const IdParamsSchema = z.object({
  id: z.string().uuid('Invalid property ID format'),
});

// ---------------------------------------------------------------------------
// GET — Get single property
// ---------------------------------------------------------------------------

/**
 * GET /api/properties/[id]
 *
 * Response: { success, data: PropertyRow }
 */
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
        { success: false, error: 'Invalid property ID', details: paramResult.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    // ── Auth ───────────────────────────────────────────────────────────────
    const auth = await authenticate(request);
    if (!auth) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      );
    }

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

    // ── Execute ────────────────────────────────────────────────────────────
    const result = await withTenantContext(
      auth.tenantId,
      auth.userId,
      auth.role,
      () => getPropertyById(id),
    );

    if (!result.success) {
      return NextResponse.json(result, { status: 500, headers: rlHeaders });
    }

    if (!result.data) {
      return NextResponse.json(
        { success: false, error: 'Property not found' },
        { status: 404, headers: rlHeaders },
      );
    }

    return NextResponse.json(result, { status: 200, headers: { ...rlHeaders, 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('[properties/[id]] GET error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// PATCH — Update a property
// ---------------------------------------------------------------------------

/**
 * PATCH /api/properties/[id]
 *
 * Body: Partial<CreatePropertyInput>
 * Response: { success, data: PropertyRow }
 */
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
        { success: false, error: 'Invalid property ID', details: paramResult.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    // ── Auth + permissions ─────────────────────────────────────────────────
    const auth = await authenticate(request);
    if (!auth) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (!canUpdate(auth.role, 'properties')) {
      return NextResponse.json({ success: false, error: 'Forbidden: insufficient permissions' }, { status: 403 });
    }

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

    const parsed = UpdatePropertySchema.safeParse(body);

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

    // Ensure at least one field is being updated
    if (Object.keys(parsed.data).length === 0) {
      return NextResponse.json(
        { success: false, error: 'No fields to update' },
        { status: 400, headers: rlHeaders },
      );
    }

    // ── Fetch old values for audit log ─────────────────────────────────────
    const oldProperty = await withTenantContext(
      auth.tenantId,
      auth.userId,
      auth.role,
      () => getPropertyById(id),
    );

    if (!oldProperty.success) {
      return NextResponse.json(oldProperty, { status: 500, headers: rlHeaders });
    }

    if (!oldProperty.data) {
      return NextResponse.json(
        { success: false, error: 'Property not found' },
        { status: 404, headers: rlHeaders },
      );
    }

    // ── Execute update ─────────────────────────────────────────────────────
    const result = await withTenantContext(
      auth.tenantId,
      auth.userId,
      auth.role,
      () => updateProperty(id, parsed.data, oldProperty.data?.updated_at),
    );

    if (!result.success) {
      return NextResponse.json(result, { status: 500, headers: rlHeaders });
    }

    // Optimistic concurrency conflict: no row matched (updated_at changed)
    if (!result.data) {
      return NextResponse.json(
        { success: false, error: 'Conflict — resource was modified by another request. Please reload and try again.' },
        { status: 409, headers: rlHeaders },
      );
    }

    // ── Audit log ──────────────────────────────────────────────────────────
    const oldValues: Record<string, unknown> = {};
    const newData = parsed.data as Record<string, unknown>;
    for (const key of Object.keys(newData)) {
      if (key in oldProperty.data) {
        oldValues[key] = (oldProperty.data as unknown as Record<string, unknown>)[key];
      }
    }

    await logUpdate(
      'property',
      id,
      oldValues,
      newData,
      {
        ipAddress: request.headers.get('x-forwarded-for') ?? null,
        userAgent: request.headers.get('user-agent') ?? null,
        requestId: request.headers.get('x-session-id') ?? null,
      },
    );

    return NextResponse.json(result, { status: 200, headers: { ...rlHeaders, 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('[properties/[id]] PATCH error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE — Delete/archive a property
// ---------------------------------------------------------------------------

/**
 * DELETE /api/properties/[id]
 *
 * Response: { success: true, data: null }
 */
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
        { success: false, error: 'Invalid property ID', details: paramResult.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    // ── Auth + permissions ─────────────────────────────────────────────────
    const auth = await authenticate(request);
    if (!auth) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (!canDelete(auth.role, 'properties')) {
      return NextResponse.json({ success: false, error: 'Forbidden: insufficient permissions' }, { status: 403 });
    }

    const { result: rlResult, headers: rlHeaders } = await withRateLimit(request, 'user', auth.userId);
    if (!rlResult.allowed) {
      return rateLimitResponse(rlResult);
    }

    // ── Fetch old values for audit log ─────────────────────────────────────
    const oldProperty = await withTenantContext(
      auth.tenantId,
      auth.userId,
      auth.role,
      () => getPropertyById(id),
    );

    if (!oldProperty.success) {
      return NextResponse.json(oldProperty, { status: 500, headers: rlHeaders });
    }

    if (!oldProperty.data) {
      return NextResponse.json(
        { success: false, error: 'Property not found' },
        { status: 404, headers: rlHeaders },
      );
    }

    // ── Execute delete ─────────────────────────────────────────────────────
    const result = await withTenantContext(
      auth.tenantId,
      auth.userId,
      auth.role,
      () => deleteProperty(id),
    );

    if (!result.success) {
      return NextResponse.json(result, { status: 500, headers: rlHeaders });
    }

    // ── Audit log ──────────────────────────────────────────────────────────
    await logDelete(
      'property',
      id,
      oldProperty.data as unknown as Record<string, unknown>,
      {
        ipAddress: request.headers.get('x-forwarded-for') ?? null,
        userAgent: request.headers.get('user-agent') ?? null,
        requestId: request.headers.get('x-session-id') ?? null,
      },
    );

    return NextResponse.json(result, { status: 200, headers: { ...rlHeaders, 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('[properties/[id]] DELETE error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
