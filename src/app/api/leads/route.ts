// ============================================================================
// EstateFlow CRM — Lead List & Create API
// GET  /api/leads   — List leads with pagination, filters, sorting
// POST /api/leads   — Create a new lead with duplicate detection
// Agent-2-1-API-Leads v1.0.0
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { buildPaginationParams } from '@/lib/types';
import {
  getLeads,
  createLead,
  type LeadFilters,
} from '@/lib/leads/queries';
import { withRateLimit, extractClientIp } from '@/lib/security/rateLimiter';
import { logCreate } from '@/lib/security/auditLogger';
import { withTenantContext } from '@/lib/auth/withTenantContext';
import type { UserRole } from '@/types/auth';

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const ALLOWED_SOURCES = [
  'website', 'referral', 'whatsapp', 'facebook', 'instagram',
  'cold_call', 'walk_in', 'other',
] as const;

const ALLOWED_STATUSES = [
  'new', 'contacted', 'qualified', 'proposal', 'negotiation',
  'closed_won', 'closed_lost', 'archived',
] as const;

const ALLOWED_PROPERTY_TYPES = [
  'apartment', 'house', 'villa', 'commercial', 'land', 'penthouse', 'studio',
] as const;

const ALLOWED_SORT_COLUMNS = [
  'created_at', 'updated_at', 'full_name', 'status', 'source',
  'ai_score', 'budget_min', 'budget_max',
] as const;

const createLeadSchema = z.object({
  full_name: z.string().min(1, 'Full name is required').max(255),
  phone: z.string().max(20).nullable().optional(),
  email: z.string().email().max(255).nullable().optional(),
  source: z.enum(ALLOWED_SOURCES).nullable().optional(),
  status: z.enum(ALLOWED_STATUSES).optional().default('new'),
  ai_score: z.number().int().min(0).max(100).nullable().optional(),
  budget_min: z.number().nonnegative().nullable().optional(),
  budget_max: z.number().nonnegative().nullable().optional(),
  preferred_location: z.string().max(255).nullable().optional(),
  property_type: z.enum(ALLOWED_PROPERTY_TYPES).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
  assigned_agent_id: z.string().uuid().nullable().optional(),
});

export type CreateLeadBody = z.infer<typeof createLeadSchema>;

// ---------------------------------------------------------------------------
// GET /api/leads
// ---------------------------------------------------------------------------

/**
 * GET /api/leads?page=1&limit=20&status=new&source=website&sort_by=created_at&sort_dir=desc
 *
 * Query parameters:
 *   page, limit         — Pagination
 *   status              — Filter by lead status
 *   source              — Filter by source
 *   assigned_agent_id   — Filter by assigned agent UUID
 *   ai_score_min        — Minimum AI score (0-100)
 *   ai_score_max        — Maximum AI score (0-100)
 *   budget_min          — Minimum budget
 *   budget_max          — Maximum budget
 *   property_type       — Filter by property type
 *   created_after       — ISO date string (inclusive)
 *   created_before      — ISO date string (inclusive)
 *   is_duplicate        — 'true' or 'false'
 *   sort_by             — Sort column (created_at, updated_at, full_name, status, source, ai_score)
 *   sort_dir            — 'asc' or 'desc' (default: 'desc')
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

    // ── Parse query params ──────────────────────────────────────────────────
    const { searchParams } = request.nextUrl;
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const pagination = buildPaginationParams(page, limit);

    const sortBy = searchParams.get('sort_by') || 'created_at';
    if (!(ALLOWED_SORT_COLUMNS as readonly string[]).includes(sortBy)) {
      return NextResponse.json(
        { success: false, data: null, error: `Invalid sort_by. Allowed: ${ALLOWED_SORT_COLUMNS.join(', ')}`, meta: null },
        { status: 400 },
      );
    }
    const sortDir = searchParams.get('sort_dir') === 'asc' ? 'asc' : 'desc';

    const status = searchParams.get('status') || undefined;
    if (status && !(ALLOWED_STATUSES as readonly string[]).includes(status)) {
      return NextResponse.json(
        { success: false, data: null, error: `Invalid status. Allowed: ${ALLOWED_STATUSES.join(', ')}`, meta: null },
        { status: 400 },
      );
    }

    const source = searchParams.get('source') || undefined;
    if (source && !(ALLOWED_SOURCES as readonly string[]).includes(source)) {
      return NextResponse.json(
        { success: false, data: null, error: `Invalid source. Allowed: ${ALLOWED_SOURCES.join(', ')}`, meta: null },
        { status: 400 },
      );
    }

    const filters: LeadFilters = {};
    if (status) filters.status = status;
    if (source) filters.source = source;
    if (searchParams.get('assigned_agent_id')) filters.assigned_agent_id = searchParams.get('assigned_agent_id')!;
    if (searchParams.get('ai_score_min')) filters.ai_score_min = parseInt(searchParams.get('ai_score_min')!, 10);
    if (searchParams.get('ai_score_max')) filters.ai_score_max = parseInt(searchParams.get('ai_score_max')!, 10);
    if (searchParams.get('budget_min')) filters.budget_min = parseFloat(searchParams.get('budget_min')!);
    if (searchParams.get('budget_max')) filters.budget_max = parseFloat(searchParams.get('budget_max')!);
    if (searchParams.get('property_type')) filters.property_type = searchParams.get('property_type')!;
    if (searchParams.get('created_after')) filters.created_after = searchParams.get('created_after')!;
    if (searchParams.get('created_before')) filters.created_before = searchParams.get('created_before')!;
    if (searchParams.get('is_duplicate')) {
      filters.is_duplicate = searchParams.get('is_duplicate') === 'true';
    }

    // ── Execute ───────────────────────────────────────────────────────────
    const result = await withTenantContext(
      tenantId,
      userId,
      userRole || 'agent',
      () => getLeads(tenantId, filters, pagination, sortBy, sortDir),
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
        headers: {
          'Cache-Control': 'private, no-store',
          ...rateHeaders,
          'X-Request-Id': requestId,
        },
      },
    );
  } catch (error) {
    console.error('[api/leads] GET error:', error);
    return NextResponse.json(
      { success: false, data: null, error: 'Internal server error', meta: null },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/leads
// ---------------------------------------------------------------------------

/**
 * POST /api/leads
 *
 * Creates a new lead. Automatically detects duplicates by phone number.
 * Encrypts the phone field at rest.
 *
 * Body: CreateLeadBody (see Zod schema above)
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
    const parsed = createLeadSchema.safeParse(body);

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
    const lead = await withTenantContext(
      tenantId,
      userId,
      userRole || 'agent',
      () => createLead(parsed.data, tenantId, userId),
    );

    // ── Audit log ─────────────────────────────────────────────────────────
    await logCreate(
      'lead',
      lead.id,
      {
        full_name: lead.full_name,
        email: lead.email,
        source: lead.source,
        status: lead.status,
      },
      { ipAddress: clientIp, userAgent, requestId },
    );

    return NextResponse.json(
      {
        success: true,
        data: lead,
        error: null,
        meta: null,
      },
      {
        status: 201,
        headers: {
          ...rateHeaders,
          'X-Request-Id': requestId,
        },
      },
    );
  } catch (error) {
    console.error('[api/leads] POST error:', error);
    return NextResponse.json(
      { success: false, data: null, error: 'Internal server error', meta: null },
      { status: 500 },
    );
  }
}
