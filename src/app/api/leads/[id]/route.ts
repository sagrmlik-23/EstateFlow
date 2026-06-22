// ============================================================================
// EstateFlow CRM — Single Lead CRUD API
// GET    /api/leads/[id]  — Get lead with full details
// PATCH  /api/leads/[id]  — Update lead fields
// DELETE /api/leads/[id]  — Archive lead (soft delete)
// Agent-2-1-API-Leads v1.0.0
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  getLeadById,
  updateLead,
  deleteLead,
} from '@/lib/leads/queries';
import { withRateLimit, extractClientIp } from '@/lib/security/rateLimiter';
import { logUpdate, logDelete } from '@/lib/security/auditLogger';
import { withTenantContext } from '@/lib/auth/withTenantContext';
import type { UserRole } from '@/types/auth';

// ---------------------------------------------------------------------------
// Zod schema for PATCH
// ---------------------------------------------------------------------------

const ALLOWED_SOURCES = [
  'website', 'referral', 'whatsapp', 'facebook', 'instagram',
  'cold_call', 'walk_in', 'other',
] as const;

const ALLOWED_STATUSES = [
  'new', 'contacted', 'qualified', 'proposal', 'negotiation',
  'won', 'lost', 'archived',
] as const;

const ALLOWED_PROPERTY_TYPES = [
  'apartment', 'villa', 'plot', 'commercial', 'penthouse', 'other',
] as const;

const updateLeadSchema = z.object({
  full_name: z.string().min(1).max(255).optional(),
  phone: z.string().max(20).nullable().optional(),
  email: z.string().email().max(255).nullable().optional(),
  source: z.enum(ALLOWED_SOURCES).nullable().optional(),
  status: z.enum(ALLOWED_STATUSES).optional(),
  ai_score: z.number().int().min(0).max(100).nullable().optional(),
  budget_min: z.number().nonnegative().nullable().optional(),
  budget_max: z.number().nonnegative().nullable().optional(),
  preferred_location: z.string().max(255).nullable().optional(),
  property_type: z.enum(ALLOWED_PROPERTY_TYPES).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
  assigned_agent_id: z.string().uuid().nullable().optional(),
});

export type UpdateLeadBody = z.infer<typeof updateLeadSchema>;

// ---------------------------------------------------------------------------
// GET /api/leads/[id]
// ---------------------------------------------------------------------------

/**
 * GET /api/leads/[id]
 *
 * Returns a single lead with full details (phone decrypted).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await params;

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

    // ── Execute ────────────────────────────────────────────────────────────
    const lead = await withTenantContext(
      tenantId,
      userId,
      userRole || 'agent',
      () => getLeadById(id),
    );

    if (!lead) {
      return NextResponse.json(
        { success: false, data: null, error: 'Lead not found', meta: null },
        { status: 404 },
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: lead,
        error: null,
        meta: null,
      },
      {
        status: 200,
        headers: { ...rateHeaders, 'X-Request-Id': requestId },
      },
    );
  } catch (error) {
    console.error('[api/leads/:id] GET error:', error);
    return NextResponse.json(
      { success: false, data: null, error: 'Internal server error', meta: null },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/leads/[id]
// ---------------------------------------------------------------------------

/**
 * PATCH /api/leads/[id]
 *
 * Updates one or more fields on a lead. Returns the updated lead.
 * Logs the change to the audit trail with old/new values.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await params;

    // ── Auth headers ───────────────────────────────────────────────────────
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

    // ── Parse & validate body ──────────────────────────────────────────────
    const body = await request.json();
    const parsed = updateLeadSchema.safeParse(body);

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

    // ── Fetch old values for audit log ────────────────────────────────────
    const oldLead = await withTenantContext(
      tenantId,
      userId,
      userRole || 'agent',
      () => getLeadById(id),
    );

    if (!oldLead) {
      return NextResponse.json(
        { success: false, data: null, error: 'Lead not found', meta: null },
        { status: 404 },
      );
    }

    // ── Execute update ─────────────────────────────────────────────────────
    const updatedLead = await withTenantContext(
      tenantId,
      userId,
      userRole || 'agent',
      () => updateLead(id, parsed.data),
    );

    // ── Audit log ──────────────────────────────────────────────────────────
    const changedFields: Record<string, unknown> = {};
    for (const key of Object.keys(parsed.data)) {
      const oldVal = (oldLead as unknown as Record<string, unknown>)[key];
      const newVal = (parsed.data as Record<string, unknown>)[key];
      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        changedFields[key] = { from: oldVal, to: newVal };
      }
    }

    await logUpdate(
      'lead',
      id,
      { ...changedFields },
      { ipAddress: clientIp, userAgent, requestId },
    );

    return NextResponse.json(
      {
        success: true,
        data: updatedLead,
        error: null,
        meta: null,
      },
      {
        status: 200,
        headers: { ...rateHeaders, 'X-Request-Id': requestId },
      },
    );
  } catch (error) {
    console.error('[api/leads/:id] PATCH error:', error);
    return NextResponse.json(
      { success: false, data: null, error: 'Internal server error', meta: null },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/leads/[id]
// ---------------------------------------------------------------------------

/**
 * DELETE /api/leads/[id]
 *
 * Soft-deletes a lead by setting status = 'archived'.
 * Logs the action to the audit trail.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await params;

    // ── Auth headers ───────────────────────────────────────────────────────
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

    // ── Fetch lead to ensure it exists & for audit ────────────────────────
    const lead = await withTenantContext(
      tenantId,
      userId,
      userRole || 'agent',
      () => getLeadById(id),
    );

    if (!lead) {
      return NextResponse.json(
        { success: false, data: null, error: 'Lead not found', meta: null },
        { status: 404 },
      );
    }

    // ── Execute soft delete ────────────────────────────────────────────────
    await withTenantContext(
      tenantId,
      userId,
      userRole || 'agent',
      () => deleteLead(id),
    );

    // ── Audit log ──────────────────────────────────────────────────────────
    await logDelete(
      'lead',
      id,
      { full_name: lead.full_name, status: lead.status, email: lead.email },
      { ipAddress: clientIp, userAgent, requestId },
    );

    return NextResponse.json(
      {
        success: true,
        data: { id, status: 'archived' },
        error: null,
        meta: null,
      },
      {
        status: 200,
        headers: { ...rateHeaders, 'X-Request-Id': requestId },
      },
    );
  } catch (error) {
    console.error('[api/leads/:id] DELETE error:', error);
    return NextResponse.json(
      { success: false, data: null, error: 'Internal server error', meta: null },
      { status: 500 },
    );
  }
}
