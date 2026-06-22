// ============================================================================
// EstateFlow CRM — Unread Notification Count API
// GET /api/communication/notifications/unread-count
// Agent-4-3-Email-Notifications v1.0.0
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { getNotificationService } from '@/lib/communication/notificationService';

// ---------------------------------------------------------------------------
// GET /api/communication/notifications/unread-count
// ---------------------------------------------------------------------------

/**
 * GET /api/communication/notifications/unread-count
 *
 * Returns the number of unread in-app notifications for the authenticated user.
 *
 * Authentication: Requires x-user-id and x-tenant-id headers.
 *
 * Response: { success: true, data: { count: number } }
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // ── Auth headers ───────────────────────────────────────────────────────
    const userId = request.headers.get('x-user-id');
    const tenantId = request.headers.get('x-tenant-id');
    const requestId = request.headers.get('x-session-id') || crypto.randomUUID();

    if (!userId || !tenantId) {
      return NextResponse.json(
        { success: false, data: null, error: 'Unauthorized — missing auth headers' },
        { status: 401 },
      );
    }

    // ── Fetch count ────────────────────────────────────────────────────────
    const service = getNotificationService();
    const count = await service.getUnreadCount(userId);

    return NextResponse.json(
      {
        success: true,
        data: { count },
        error: null,
      },
      {
        status: 200,
        headers: { 'X-Request-Id': requestId },
      },
    );
  } catch (error) {
    console.error('[api/communication/notifications/unread-count] GET error:', error);
    return NextResponse.json(
      { success: false, data: null, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
