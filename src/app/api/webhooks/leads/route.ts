import { NextResponse, type NextRequest } from 'next/server';
import { handleWebhookCallback, parseWebhookPayload } from '@/lib/leads/intakeWebhook';
import { withRateLimit } from '@/lib/security/rateLimiter';
import { auditLog } from '@/lib/security/auditLogger';
import { assignLeadToAgent } from '@/lib/leads/smartAssignment';
import { logActivity } from '@/lib/activity/queries';

/**
 * POST /api/webhooks/leads
 *
 * Generic lead intake webhook. Accepts lead data from any source
 * (website forms, third-party integrations, manual entry).
 *
 * Body: {
 *   source: string,          // Source identifier (e.g., 'website', 'referral')
 *   first_name?: string,
 *   last_name?: string,
 *   name?: string,
 *   email?: string,
 *   phone: string,
 *   property_type?: string,
 *   budget?: number,
 *   city?: string,
 *   message?: string,
 *   ... any other fields will be captured as metadata
 * }
 *
 * Headers:
 *   x-tenant-id (optional) — If not provided, a tenant slug or API key is required
 *   Authorization (optional for public webhooks) — Bearer token for authenticated sources
 *
 * Response:
 *   201: { success: true, data: { lead: ProcessedLead, assignment: AssignmentResult | null } }
 *   200: { success: true, data: null, duplicate: true, duplicateOf: 'lead-id' }
 *   400: { success: false, error: 'Validation error' }
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // ── Rate Limit (webhook tier) ────────────────────────────────────
    const { result: rateLimitResult } = await withRateLimit(
      request,
      'webhook',
    );
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many requests. Please try again later.' },
        {
          status: 429,
          headers: {
            'Retry-After': String(rateLimitResult.resetIn),
            'X-RateLimit-Limit': String(rateLimitResult.limit),
            'X-RateLimit-Remaining': '0',
          },
        },
      );
    }

    // ── Parse Body ──────────────────────────────────────────────────
    const body = (await request.json()) as Record<string, unknown>;

    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { success: false, error: 'Invalid request body' },
        { status: 400 },
      );
    }

    // ── Resolve Tenant ──────────────────────────────────────────────
    // Webhooks can receive tenant context via header, query param, or body.
    const tenantId =
      request.headers.get('x-tenant-id') ??
      (body.tenant_id as string) ??
      (body.tenantId as string) ??
      (request.nextUrl.searchParams.get('tenant_id') as string);

    if (!tenantId) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Tenant ID is required. Provide via x-tenant-id header, tenant_id in body, or ?tenant_id= query param.',
        },
        { status: 400 },
      );
    }

    // ── Validate Required Fields ─────────────────────────────────────
    const source = (body.source as string) ?? 'website';
    const phone = (body.phone as string) ?? (body.mobile as string) ?? '';
    const email = body.email as string;

    if (!phone && !email) {
      return NextResponse.json(
        { success: false, error: 'Either phone or email is required' },
        { status: 400 },
      );
    }

    // ── Process Webhook Lead ────────────────────────────────────────
    const result = await handleWebhookCallback(source, body, tenantId);

    if (!result.success && result.errors.length > 0) {
      return NextResponse.json(
        { success: false, error: result.errors.join('; ') },
        { status: 400 },
      );
    }

    if (result.duplicate) {
      return NextResponse.json(
        {
          success: true,
          data: null,
          duplicate: true,
          duplicateOf: result.duplicateOf,
        },
        { status: 200 },
      );
    }

    // ── Smart Assignment ────────────────────────────────────────────
    let assignmentResult = null;
    if (result.lead) {
      assignmentResult = await assignLeadToAgent(
        result.lead.id,
        tenantId,
        'workload',
        result.lead.propertyType ?? undefined,
      );

      // Log activity
      await logActivity(
        tenantId,
        null, // system action
        'webhook_received',
        result.lead.id,
        `Lead received from ${source}: ${result.lead.firstName} ${result.lead.lastName}`,
        'lead',
        {
          source,
          phone: result.lead.phone,
          assignedTo: assignmentResult.assignedTo,
        },
      ).catch(() => {});
    }

    // ── Audit Log ────────────────────────────────────────────────────
    await auditLog({
      tenantId,
      userId: 'webhook',
      action: 'create',
      entityType: 'lead',
      entityId: result.lead?.id ?? '',
      oldValues: null,
      newValues: {
        source,
        phone,
        firstName: result.lead?.firstName,
        lastName: result.lead?.lastName,
      },
      ipAddress: request.headers.get('x-forwarded-for') ?? null,
      userAgent: request.headers.get('user-agent') ?? null,
      requestId: crypto.randomUUID(),
    }).catch(() => {});

    return NextResponse.json(
      {
        success: true,
        data: {
          lead: result.lead,
          assignment: assignmentResult,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error('[webhooks/leads]', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}

/**
 * GET /api/webhooks/leads
 *
 * Health check / verification endpoint for webhook configuration.
 */
export async function GET(_request: NextRequest): Promise<NextResponse> {
  return NextResponse.json(
    {
      success: true,
      data: {
        message: 'Lead intake webhook endpoint is active',
        version: '1.0.0',
        supportedSources: ['facebook', 'google', 'website', 'referral', 'whatsapp'],
      },
    },
    { status: 200 },
  );
}
