// ============================================================================
// EstateFlow CRM — Notifications API
// GET  /api/communication/notifications  — List notifications
// POST /api/communication/notifications  — Mark as read
// Agent-4-3-Email-Notifications v1.0.0
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getNotificationService } from '@/lib/communication/notificationService';

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const markReadSchema = z.object({
  notificationIds: z.array(z.string().uuid()).optional(),
  markAll: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// GET /api/communication/notifications
// ---------------------------------------------------------------------------

/**
 * GET /api/communication/notifications
 *
 * List in-app notifications for the authenticated user.
 *
 * Authentication: Requires x-user-id and x-tenant-id headers.
 *
 * Query parameters:
 *   limit     — Max results per page (default: 50, max: 100)
 *   offset    — Pagination offset (default: 0)
 *   unread    — 'true' to only show unread notifications
 *
 * Response: { success: true, data: Notification[], meta: { total, limit, offset } }
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

    // ── Parse query params ──────────────────────────────────────────────────
    const { searchParams } = request.nextUrl;
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));
    const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10));
    const unreadOnly = searchParams.get('unread') === 'true';

    // ── Fetch notifications ────────────────────────────────────────────────
    const service = getNotificationService();
    const { data, total } = await service.getNotifications(userId, {
      limit,
      offset,
      unreadOnly,
    });

    return NextResponse.json(
      {
        success: true,
        data,
        error: null,
        meta: { total, limit, offset },
      },
      {
        status: 200,
        headers: { 'X-Request-Id': requestId },
      },
    );
  } catch (error) {
    console.error('[api/communication/notifications] GET error:', error);
    return NextResponse.json(
      { success: false, data: null, error: 'Internal server error' },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST /api/communication/notifications
// ---------------------------------------------------------------------------

/**
 * POST /api/communication/notifications
 *
 * Mark one or more notifications as read, or mark all as read.
 *
 * Authentication: Requires x-user-id and x-tenant-id headers.
 *
 * Body: { notificationIds?: string[], markAll?: boolean }
 *   - notificationIds: Array of notification UUIDs to mark as read
 *   - markAll: If true, marks ALL notifications as read for this user
 *     (notificationIds is ignored when markAll is true)
 *
 * Response: { success: true, data: { marked: number } }
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
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

    // ── Parse body ─────────────────────────────────────────────────────────
    const body: unknown = await request.json();
    const parsed = markReadSchema.safeParse(body);

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

    // ── Mark as read ───────────────────────────────────────────────────────
    const service = getNotificationService();
    let markedCount = 0;

    if (parsed.data.markAll) {
      markedCount = await service.markAllAsRead(userId);
    } else if (parsed.data.notificationIds && parsed.data.notificationIds.length > 0) {
      for (const id of parsed.data.notificationIds) {
        const success = await service.markAsRead(id, userId);
        if (success) markedCount++;
      }
    }

    return NextResponse.json(
      {
        success: true,
        data: { marked: markedCount },
        error: null,
      },
      {
        status: 200,
        headers: { 'X-Request-Id': requestId },
      },
    );
  } catch (error) {
    console.error('[api/communication/notifications] POST error:', error);
    return NextResponse.json(
      { success: false, data: null, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
