import { NextResponse, type NextRequest } from 'next/server';
import { handleWebhookCallback } from '@/lib/leads/intakeWebhook';
import { withRateLimit } from '@/lib/security/rateLimiter';
import { auditLog } from '@/lib/security/auditLogger';
import { assignLeadToAgent } from '@/lib/leads/smartAssignment';
import { logActivity } from '@/lib/activity/queries';

/**
 * POST /api/webhooks/google
 *
 * Google Lead Forms webhook endpoint.
 *
 * Accepts the Google Forms / Google Lead Management payload format
 * and converts it into an EstateFlow lead.
 *
 * Body (Google format):
 * {
 *   form_response_id: string,
 *   form_id: string,
 *   answers: [
 *     { question: string, value: string }
 *   ],
 *   submitted_at: string
 * }
 *
 * Headers:
 *   x-tenant-id — Required. Tenant UUID to associate the lead with.
 *   x-webhook-secret — Optional. Shared secret for webhook verification.
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
        { success: false, error: 'Too many requests' },
        { status: 429 },
      );
    }

    // ── Resolve Tenant ──────────────────────────────────────────────
    const tenantId = request.headers.get('x-tenant-id');
    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: 'x-tenant-id header is required' },
        { status: 400 },
      );
    }

    // ── Webhook Secret Verification ──────────────────────────────────
    const webhookSecret = request.headers.get('x-webhook-secret');
    const expectedSecret = process.env.GOOGLE_WEBHOOK_SECRET;
    if (expectedSecret && webhookSecret !== expectedSecret) {
      return NextResponse.json(
        { success: false, error: 'Invalid webhook secret' },
        { status: 401 },
      );
    }

    // ── Parse Google Payload ─────────────────────────────────────────
    const body = (await request.json()) as Record<string, unknown>;

    if (!body || !body.form_response_id) {
      return NextResponse.json(
        { success: false, error: 'Invalid Google webhook payload — missing form_response_id' },
        { status: 400 },
      );
    }

    // ── Process Google Lead ─────────────────────────────────────────
    const result = await handleWebhookCallback('google', body, tenantId);

    if (!result.success && result.errors.length > 0) {
      return NextResponse.json(
        { success: false, error: result.errors.join('; ') },
        { status: 400 },
      );
    }

    // ── Handle Result ───────────────────────────────────────────────
    let assignmentResult = null;

    if (result.success && result.lead) {
      // Smart assignment
      assignmentResult = await assignLeadToAgent(
        result.lead.id,
        tenantId,
        'workload',
        result.lead.propertyType ?? undefined,
      );

      // Log activity
      await logActivity(
        tenantId,
        null,
        'webhook_received',
        result.lead.id,
        `Google lead form: ${result.lead.firstName} ${result.lead.lastName}`,
        'lead',
        {
          source: 'google',
          formId: body.form_id,
          formResponseId: body.form_response_id,
        },
      ).catch(() => {});
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

    // ── Audit Log ────────────────────────────────────────────────────
    await auditLog({
      tenantId,
      userId: 'webhook:google',
      action: 'create',
      entityType: 'lead',
      entityId: result.lead?.id ?? '',
      oldValues: null,
      newValues: {
        source: 'google',
        formId: body.form_id,
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
    console.error('[webhooks/google]', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}

/**
 * GET /api/webhooks/google
 *
 * Google webhook verification and health check endpoint.
 */
export async function GET(_request: NextRequest): Promise<NextResponse> {
  return NextResponse.json(
    {
      success: true,
      data: {
        message: 'Google Lead Forms webhook endpoint is active',
        version: '1.0.0',
      },
    },
    { status: 200 },
  );
}
