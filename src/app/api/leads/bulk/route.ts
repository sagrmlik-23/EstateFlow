// ============================================================================
// EstateFlow CRM — Bulk Lead Operations API
// POST /api/leads/bulk — Bulk update leads (status change, reassign)
// Agent-2-1-API-Leads v1.0.0
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { bulkUpdateLeads } from '@/lib/leads/queries';
import { withRateLimit, extractClientIp } from '@/lib/security/rateLimiter';
import { auditLog } from '@/lib/security/auditLogger';
import { withTenantContext } from '@/lib/auth/withTenantContext';
import type { UserRole } from '@/types/auth';

// ---------------------------------------------------------------------------
// Zod schema
// ---------------------------------------------------------------------------

const ALLOWED_STATUSES = [
  'new', 'contacted', 'qualified', 'proposal', 'negotiation',
  'won', 'lost', 'archived',
] as const;

const bulkUpdateSchema = z.object({
  lead_ids: z.array(z.string().uuid()).min(1, 'At least one lead ID is required').max(500, 'Maximum 500 leads per bulk operation'),
  data: z.object({
    status: z.enum(ALLOWED_STATUSES).optional(),
    assigned_agent_id: z.string().uuid().nullable().optional(),
    source: z.enum(['website', 'referral', 'whatsapp', 'facebook', 'instagram', 'cold_call', 'walk_in', 'other']).optional(),
    ai_score: z.number().int().min(0).max(100).nullable().optional(),
  }).refine(
    (d) => Object.keys(d).length > 0,
    { message: 'At least one field to update (status, assigned_agent_id, source, or ai_score) is required' },
  ),
});

export type BulkUpdateBody = z.infer<typeof bulkUpdateSchema>;

// ---------------------------------------------------------------------------
// POST /api/leads/bulk
// ---------------------------------------------------------------------------

/**
 * POST /api/leads/bulk
 *
 * Bulk update leads — change status, reassign agent, or update source.
 *
 * Body:
 * {
 *   lead_ids: string[] (UUIDs, 1–500),
 *   data: {
 *     status?: 'new' | 'contacted' | 'qualified' | 'proposal' | 'negotiation' | 'won' | 'lost' | 'archived',
 *     assigned_agent_id?: string | null (UUID),
 *     source?: string,
 *     ai_score?: number | null (0–100)
 *   }
 * }
 *
 * Response:
 * {
 *   success: true,
 *   data: { updated_count: number },
 *   error: null,
 *   meta: null
 * }
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
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
    const parsed = bulkUpdateSchema.safeParse(body);

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
    const updatedCount = await withTenantContext(
      tenantId,
      userId,
      userRole || 'agent',
      () => bulkUpdateLeads(parsed.data.lead_ids, parsed.data.data),
    );

    // ── Audit log ──────────────────────────────────────────────────────────
    await auditLog({
      action: 'update',
      entityType: 'lead',
      entityId: `bulk:${parsed.data.lead_ids.length}ids`,
      oldValues: null,
      newValues: {
        count: parsed.data.lead_ids.length,
        changes: parsed.data.data,
      },
      ipAddress: clientIp,
      userAgent,
      requestId,
      tenantId,
      userId,
    });

    return NextResponse.json(
      {
        success: true,
        data: { updated_count: updatedCount },
        error: null,
        meta: null,
      },
      {
        status: 200,
        headers: { ...rateHeaders, 'X-Request-Id': requestId },
      },
    );
  } catch (error) {
    console.error('[api/leads/bulk] POST error:', error);
    return NextResponse.json(
      { success: false, data: null, error: 'Internal server error', meta: null },
      { status: 500 },
    );
  }
}
