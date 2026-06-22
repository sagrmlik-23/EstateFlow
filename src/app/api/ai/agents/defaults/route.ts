// ============================================================================
// EstateFlow CRM — AI Agent Defaults API
// GET  /api/ai/agents/defaults      — Get default agent template
// POST /api/ai/agents/defaults      — Create default agents for a new tenant
// Phase 3: AI Voice Agent — Agent Configuration System
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getDefaultAgentTemplate } from '@/lib/ai/defaultAgents';
import { createAgent } from '@/lib/ai/agentConfig';
import { withRateLimit, extractClientIp } from '@/lib/security/rateLimiter';
import { logCreate } from '@/lib/security/auditLogger';
import { withTenantContext } from '@/lib/auth/withTenantContext';
import type { UserRole } from '@/types/auth';

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const createDefaultsSchema = z.object({
  tenantId: z.string().uuid('Tenant ID must be a valid UUID'),
  count: z.number().int().min(1).max(5).optional().default(1),
});

// ---------------------------------------------------------------------------
// GET /api/ai/agents/defaults
// ---------------------------------------------------------------------------

/**
 * GET /api/ai/agents/defaults
 *
 * Returns the default AI agent template configuration.
 * Useful for UI forms to pre-populate new agent creation.
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

    // ── Return template ────────────────────────────────────────────────────
    const template = getDefaultAgentTemplate();

    return NextResponse.json(
      {
        success: true,
        data: template,
        error: null,
        meta: null,
      },
      {
        status: 200,
        headers: { ...rateHeaders, 'X-Request-Id': requestId },
      },
    );
  } catch (error) {
    console.error('[api/ai/agents/defaults] GET error:', error);
    return NextResponse.json(
      { success: false, data: null, error: 'Internal server error', meta: null },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/ai/agents/defaults
// ---------------------------------------------------------------------------

/**
 * POST /api/ai/agents/defaults
 *
 * Creates default AI agents for a tenant (typically called during onboarding).
 * Creates Sneha (Hindi, client-facing) as the primary default agent.
 * Optionally creates additional agents based on the `count` parameter.
 *
 * Body:
 *   tenantId  — UUID of the tenant to create agents for
 *   count     — Number of default agents to create (1-5, default: 1)
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
    const parsed = createDefaultsSchema.safeParse(body);

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

    const { tenantId: targetTenantId, count } = parsed.data;

    // ── Create default agents ──────────────────────────────────────────────
    const agents = [];

    for (let i = 0; i < count; i++) {
      const agentName = i === 0 ? 'Sneha' : `Sneha-${i + 1}`;
      const language = i === 0 ? 'hi' : i === 1 ? 'en' : i === 2 ? 'gu' : i === 3 ? 'mr' : 'bn';

      const agent = await withTenantContext(
        tenantId,
        userId,
        userRole || 'tenant_admin',
        () =>
          createAgent(targetTenantId, {
            name: agentName,
            voice: 'default-female',
            language,
            greeting: i === 0
              ? 'नमस्ते! मैं स्नेहा बोल रही हूँ, [Company Name] से।'
              : `Hello! I'm ${agentName} from [Company Name].`,
            scriptTemplates: {
              firstContact: `Hello {leadName}! This is ${agentName} from [Company Name]. I'm calling about your interest in {propertyType} in {location}. Do you have a moment to chat?`,
              followUp: `Hi {leadName}, this is ${agentName} from [Company Name]. We spoke about {propertyName} earlier. Do you have any questions I can help with?`,
              siteVisitConfirm: `Hi {leadName}, this is ${agentName} from [Company Name]. Your site visit for {propertyName} is scheduled for {date} at {time} at {address}. Please confirm your availability.`,
              postVisit: `Hi {leadName}, this is ${agentName} from [Company Name]. Hope you enjoyed your visit to {propertyName}. I'd love to hear your thoughts and answer any questions.`,
              negotiation: `Hi {leadName}, this is ${agentName} from [Company Name]. I'm calling to discuss pricing and terms for {propertyName}. The current price is {price}. Can we find a solution that works for your budget?`,
              reEngagement: `Hi {leadName}, this is ${agentName} from [Company Name]. We have some new properties in {location} that might interest you. Are you still looking for a property?`,
            },
            behavior: {
              callDelayMinutes: 5,
              maxCallDuration: 300,
              maxRetries: 3,
              transferToHuman: {
                budgetThreshold: 5000000,
                angerDetected: true,
                complexQuestion: true,
              },
              offers: {
                maxDiscount: 5,
                canOfferParking: true,
                canOfferFurniture: false,
                canOfferMaintenance: true,
              },
            },
            maxConcurrentCalls: 5,
          }),
      );

      agents.push(agent);
    }

    // ── Audit log ─────────────────────────────────────────────────────────
    await logCreate(
      'ai_agent_defaults',
      targetTenantId,
      {
        count: agents.length,
        agents: agents.map((a) => ({ id: a.id, name: a.name, language: a.language })),
      },
      { ipAddress: clientIp, userAgent, requestId },
    );

    return NextResponse.json(
      {
        success: true,
        data: {
          created: agents.length,
          agents,
        },
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
    console.error('[api/ai/agents/defaults] POST error:', error);
    return NextResponse.json(
      { success: false, data: null, error: 'Internal server error', meta: null },
      { status: 500 },
    );
  }
}
