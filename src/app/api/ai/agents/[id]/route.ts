// ============================================================================
// EstateFlow CRM — Single AI Agent CRUD API
// GET    /api/ai/agents/[id]  — Get single agent
// PATCH  /api/ai/agents/[id]  — Update agent config
// DELETE /api/ai/agents/[id]  — Deactivate agent (soft delete)
// Phase 3: AI Voice Agent — Agent Configuration System
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  getAgent,
  updateAgent,
  deleteAgent,
} from '@/lib/ai/agentConfig';
import { withRateLimit, extractClientIp } from '@/lib/security/rateLimiter';
import { logUpdate, logDelete } from '@/lib/security/auditLogger';
import { withTenantContext } from '@/lib/auth/withTenantContext';
import type { UserRole } from '@/types/auth';

// ---------------------------------------------------------------------------
// Zod schema for PATCH
// ---------------------------------------------------------------------------

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

const updateAgentSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  voice: z.string().max(100).optional(),
  language: z.string().max(10).optional(),
  greeting: z.string().max(500).optional(),
  purpose: z.string().max(500).optional(),
  status: z.enum(['active', 'inactive', 'paused', 'error']).optional(),
  scriptTemplates: z.object({
    firstContact: z.string().max(5000).optional(),
    followUp: z.string().max(5000).optional(),
    siteVisitConfirm: z.string().max(5000).optional(),
    postVisit: z.string().max(5000).optional(),
    negotiation: z.string().max(5000).optional(),
    reEngagement: z.string().max(5000).optional(),
  }).optional(),
  behavior: behaviorSchema,
  maxConcurrentCalls: z.number().int().min(1).max(100).optional(),
});

export type UpdateAgentBody = z.infer<typeof updateAgentSchema>;

// ---------------------------------------------------------------------------
// GET /api/ai/agents/[id]
// ---------------------------------------------------------------------------

/**
 * GET /api/ai/agents/[id]
 *
 * Returns a single AI agent by ID.
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
    const agent = await withTenantContext(
      tenantId,
      userId,
      userRole || 'agent',
      () => getAgent(id),
    );

    if (!agent) {
      return NextResponse.json(
        { success: false, data: null, error: 'AI agent not found', meta: null },
        { status: 404 },
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: agent,
        error: null,
        meta: null,
      },
      {
        status: 200,
        headers: { ...rateHeaders, 'X-Request-Id': requestId },
      },
    );
  } catch (error) {
    console.error('[api/ai/agents/:id] GET error:', error);
    return NextResponse.json(
      { success: false, data: null, error: 'Internal server error', meta: null },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/ai/agents/[id]
// ---------------------------------------------------------------------------

/**
 * PATCH /api/ai/agents/[id]
 *
 * Updates one or more fields on an AI agent config.
 * Logs the change to the audit trail.
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
    const parsed = updateAgentSchema.safeParse(body);

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
    const oldAgent = await withTenantContext(
      tenantId,
      userId,
      userRole || 'agent',
      () => getAgent(id),
    );

    if (!oldAgent) {
      return NextResponse.json(
        { success: false, data: null, error: 'AI agent not found', meta: null },
        { status: 404 },
      );
    }

    // ── Execute update ─────────────────────────────────────────────────────
    const updatedAgent = await withTenantContext(
      tenantId,
      userId,
      userRole || 'agent',
      () => updateAgent(id, parsed.data as Parameters<typeof updateAgent>[1]),
    );

    // ── Audit log ──────────────────────────────────────────────────────────
    const changedFields: Record<string, { from: unknown; to: unknown }> = {};
    const parsedData = parsed.data as Record<string, unknown>;
    const oldData = oldAgent as unknown as Record<string, unknown>;

    for (const key of Object.keys(parsed.data)) {
      const oldVal = oldData[key];
      const newVal = parsedData[key];
      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        changedFields[key] = { from: oldVal, to: newVal };
      }
    }

    await logUpdate(
      'ai_agent',
      id,
      { ...changedFields },
      { ipAddress: clientIp, userAgent, requestId },
    );

    return NextResponse.json(
      {
        success: true,
        data: updatedAgent,
        error: null,
        meta: null,
      },
      {
        status: 200,
        headers: { ...rateHeaders, 'X-Request-Id': requestId },
      },
    );
  } catch (error) {
    console.error('[api/ai/agents/:id] PATCH error:', error);
    return NextResponse.json(
      { success: false, data: null, error: 'Internal server error', meta: null },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/ai/agents/[id]
// ---------------------------------------------------------------------------

/**
 * DELETE /api/ai/agents/[id]
 *
 * Soft-deactivates an AI agent by setting status to 'inactive'.
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

    // ── Fetch agent to ensure it exists & for audit ────────────────────────
    const agent = await withTenantContext(
      tenantId,
      userId,
      userRole || 'agent',
      () => getAgent(id),
    );

    if (!agent) {
      return NextResponse.json(
        { success: false, data: null, error: 'AI agent not found', meta: null },
        { status: 404 },
      );
    }

    // ── Execute soft delete ────────────────────────────────────────────────
    await withTenantContext(
      tenantId,
      userId,
      userRole || 'agent',
      () => deleteAgent(id),
    );

    // ── Audit log ──────────────────────────────────────────────────────────
    await logDelete(
      'ai_agent',
      id,
      { name: agent.name, status: agent.status, language: agent.language },
      { ipAddress: clientIp, userAgent, requestId },
    );

    return NextResponse.json(
      {
        success: true,
        data: { id, status: 'inactive' },
        error: null,
        meta: null,
      },
      {
        status: 200,
        headers: { ...rateHeaders, 'X-Request-Id': requestId },
      },
    );
  } catch (error) {
    console.error('[api/ai/agents/:id] DELETE error:', error);
    return NextResponse.json(
      { success: false, data: null, error: 'Internal server error', meta: null },
      { status: 500 },
    );
  }
}
