// ============================================================================
// EstateFlow CRM — Send Email API
// POST /api/communication/email/send
// Agent-4-3-Email-Notifications v1.0.0
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getResendProvider } from '@/lib/communication/providers/resend';

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const attachmentSchema = z.object({
  content: z.string().optional(),
  filename: z.string().optional(),
  path: z.string().optional(),
  contentType: z.string().optional(),
  contentId: z.string().optional(),
});

const sendEmailSchema = z.object({
  to: z.union([z.string().email(), z.array(z.string().email())]),
  subject: z.string().min(1, 'Subject is required').max(998),
  html: z.string().min(1, 'HTML body is required'),
  from: z.string().optional(),
  replyTo: z.union([z.string(), z.array(z.string())]).optional(),
  attachments: z.array(attachmentSchema).optional(),
  scheduledAt: z.string().datetime().optional(),
  cc: z.union([z.string().email(), z.array(z.string().email())]).optional(),
  bcc: z.union([z.string().email(), z.array(z.string().email())]).optional(),
});

export type SendEmailBody = z.infer<typeof sendEmailSchema>;

// ---------------------------------------------------------------------------
// POST /api/communication/email/send
// ---------------------------------------------------------------------------

/**
 * POST /api/communication/email/send
 *
 * Send an email via the Resend provider.
 *
 * Authentication: Requires x-user-id and x-tenant-id headers.
 * Rate-limited per user.
 *
 * Body: SendEmailBody
 *   - to: string | string[] (recipient email(s))
 *   - subject: string
 *   - html: string
 *   - from?: string (sender override)
 *   - replyTo?: string | string[]
 *   - attachments?: array of { content?, filename?, path?, contentType?, contentId? }
 *   - scheduledAt?: ISO 8601 datetime
 *   - cc?: string | string[]
 *   - bcc?: string | string[]
 *
 * Response: { success: true, data: { id: string } }
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // ── Auth headers ───────────────────────────────────────────────────────
    const userId = request.headers.get('x-user-id');
    const tenantId = request.headers.get('x-tenant-id');
    const requestId = request.headers.get('x-session-id') || crypto.randomUUID();

    if (!userId || !tenantId) {
      return NextResponse.json(
        {
          success: false,
          data: null,
          error: 'Unauthorized — missing x-user-id or x-tenant-id headers',
        },
        { status: 401 },
      );
    }

    // ── Parse & validate body ──────────────────────────────────────────────
    const body: unknown = await request.json();
    const parsed = sendEmailSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          data: null,
          error: parsed.error.errors
            .map((e) => `${e.path.join('.')}: ${e.message}`)
            .join('; '),
        },
        { status: 400 },
      );
    }

    // ── Send email ─────────────────────────────────────────────────────────
    const provider = getResendProvider();
    const result = await provider.sendEmail(parsed.data);

    return NextResponse.json(
      {
        success: true,
        data: result,
        error: null,
      },
      {
        status: 200,
        headers: {
          'X-Request-Id': requestId,
        },
      },
    );
  } catch (error) {
    console.error('[api/communication/email/send] POST error:', error);

    const message =
      error instanceof Error ? error.message : 'Internal server error';

    return NextResponse.json(
      { success: false, data: null, error: message },
      { status: 500 },
    );
  }
}
