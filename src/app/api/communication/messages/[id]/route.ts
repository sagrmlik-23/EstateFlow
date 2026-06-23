// ============================================================================
// EstateFlow CRM — Single Message Detail API
// GET /api/communication/messages/[id] — Get message details
// Phase 4 — Communication (AGENT-4-2-WHATSAPP-SMS)
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { withRateLimit } from '@/lib/security/rateLimiter';

// ---------------------------------------------------------------------------
// GET /api/communication/messages/[id]
// ---------------------------------------------------------------------------

/**
 * GET /api/communication/messages/[id]
 *
 * Returns a single message with full details.
 *
 * Path params:
 *   id — Message UUID
 *
 * Headers:
 *   x-user-id, x-tenant-id, x-user-role — Auth headers
 */
export async function GET(
  request: NextRequest,
  { params: _params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    // ── Auth headers ───────────────────────────────────────────────────────
    const userId = request.headers.get('x-user-id');
    const tenantId = request.headers.get('x-tenant-id');
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

    // ── In production, query the database here ────────────────────────────
    // For now, this is a placeholder that returns a "not implemented" response.
    // The actual DB queries will be added in a later phase.
    // import { getMessageById } from '@/lib/communication/queries';
    // const message = await getMessageById(id, tenantId);

    return NextResponse.json(
      {
        success: false,
        data: null,
        error: 'Message detail retrieval not yet implemented. The database queries layer will be added in a later phase.',
        meta: null,
      },
      {
        status: 501,
        headers: { ...rateHeaders, 'X-Request-Id': requestId },
      },
    );
  } catch (error) {
    console.error('[api/communication/messages/:id] GET error:', error);
    return NextResponse.json(
      { success: false, data: null, error: 'Internal server error', meta: null },
      { status: 500 },
    );
  }
}
