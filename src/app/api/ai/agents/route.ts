// ============================================================================
// EstateFlow CRM — AI Agent List & Create API
// GET  /api/ai/agents      — List all agents for a tenant
// POST /api/ai/agents      — Create a new AI agent
// Phase 3: AI Voice Agent — Agent Configuration System
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  getTenantAgents,
  createAgent,
} from '@/lib/ai/agentConfig';
import { withRateLimit, extractClientIp } from '@/lib/security/rateLimiter';
import { logCreate } from '@/lib/security/auditLogger';
import { withTenantContext } from '@/lib/auth/withTenantContext';
import type { UserRole } from '@/types/auth';

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const ALLOWED_LANGUAGES = ['en', 'hi', 'gu', 'mr', 'bn', 'ta', 'te', 'kn', 'ml', 'pa', 'es'] as const;

const scriptTemplatesSchema = z.object({
  firstContact: z.string().max(5000).optional(),
  followUp: z.string().max(5000).optional(),
  siteVisitConfirm: z.string().max(5000).optional(),
  postVisit: z.string().max(5000).optional(),
  negotiation: z.string().max(5000).optional(),
  reEngagement: z.string().max(5000).optional(),
}).optional();

const transferToHumanSchema = z.object({
  budgetThreshold: z.number().nonnegative().optional(),
  angerDetected: z.boolean().optional(),
  complexQuestion: z.boolean().optional(),
}).optional();

const offersSchema = z.object({
  maxDiscount: z.number().min(0).max(100).optional(),
  canOfferParking: z.boolean().optional(),
  canOfferFurniture: z.boolean().optional(),
  canOfferMaintenance: z.boolean().optional(),
}).optional();

const behaviorSchema = z.object({
  callDelayMinutes: z.number().nonnegative().optional(),
  maxCallDuration: z.number().positive().optional(),
  maxRetries: z.number().int().nonnegative().optional(),
  transferToHuman: transferToHumanSchema,
  offers: offersSchema,
}).optional();

const createAgentSchema = z.object({
  name: z.string().min(1, 'Agent name is required').max(255),
  voice: z.string().max(100).optional().default('default-female'),
  language: z.string().max(10).optional().default('hi'),
  greeting: z.string().max(500).optional(),
  purpose: z.string().max(500).optional(),
  scriptTemplates: scriptTemplatesSchema,
  behavior: behaviorSchema,
  maxConcurrentCalls: z.number().int().min(1).max(100).optional().default(5),
});

export type CreateAgentBody = z.infer<typeof createAgentSchema>;

// ---------------------------------------------------------------------------
// GET /api/ai/agents
// ---------------------------------------------------------------------------

/**
 * GET /api/ai/agents
 *
 * Returns all AI agents for the authenticated tenant.
 * Query params:
 *   status  — Filter by status (active, inactive, paused, error)
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

    // ── Execute ───────────────────────────────────────────────────────────
    const agents = await withTenantContext(
      tenantId,
      userId,
      userRole || 'agent',
      () => getTenantAgents(tenantId),
    );

    // Optional status filter
    const { searchParams } = request.nextUrl;
    const statusFilter = searchParams.get('status');
    const filtered = statusFilter
      ? agents.filter((a) => a.status === statusFilter)
      : agents;

    return NextResponse.json(
      {
        success: true,
        data: filtered,
        error: null,
        meta: null,
      },
      {
        status: 200,
        headers: {
          ...rateHeaders,
          'X-Request-Id': requestId,
        },
      },
    );
  } catch (error) {
    console.error('[api/ai/agents] GET error:', error);
    return NextResponse.json(
      { success: false, data: null, error: 'Internal server error', meta: null },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/ai/agents
// ---------------------------------------------------------------------------

/**
 * POST /api/ai/agents
 *
 * Creates a new AI agent for the tenant.
 *
 * Body: CreateAgentBody (see Zod schema above)
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
    const parsed = createAgentSchema.safeParse(body);

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
    const agent = await withTenantContext(
      tenantId,
      userId,
      userRole || 'agent',
      () => createAgent(tenantId, parsed.data as Parameters<typeof createAgent>[1]),
    );

    // ── Audit log ─────────────────────────────────────────────────────────
    await logCreate(
      'ai_agent',
      agent.id,
      {
        name: agent.name,
        language: agent.language,
        voice: agent.voice,
        status: agent.status,
      },
      { ipAddress: clientIp, userAgent, requestId },
    );

    return NextResponse.json(
      {
        success: true,
        data: agent,
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
    console.error('[api/ai/agents] POST error:', error);
    return NextResponse.json(
      { success: false, data: null, error: 'Internal server error', meta: null },
      { status: 500 },
    );
  }
}
