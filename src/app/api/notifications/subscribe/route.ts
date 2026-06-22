// ============================================================================
// EstateFlow CRM — Push Subscription API
// POST /api/notifications/subscribe  — Save subscription
// DELETE /api/notifications/subscribe — Remove subscription
// Agent-4-6-Notification-Preferences v1.0.0
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getPushNotificationService } from '@/lib/notification';

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const subscribeSchema = z.object({
  endpoint: z.string().url('Invalid endpoint URL'),
  keys: z.object({
    p256dh: z.string().min(1, 'p256dh key is required'),
    auth: z.string().min(1, 'auth key is required'),
  }),
  userAgent: z.string().nullable().optional(),
});

const unsubscribeSchema = z.object({
  endpoint: z.string().url('Invalid endpoint URL'),
});

// ---------------------------------------------------------------------------
// POST /api/notifications/subscribe
// ---------------------------------------------------------------------------

/**
 * POST /api/notifications/subscribe
 *
 * Save a push notification subscription for the authenticated user.
 *
 * Authentication: Requires x-user-id and x-tenant-id headers.
 *
 * Body: { endpoint, keys: { p256dh, auth }, userAgent? }
 *
 * Response: { success: true, data: PushSubscriptionRecord }
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const userId = request.headers.get('x-user-id');
    const tenantId = request.headers.get('x-tenant-id');
    const requestId = request.headers.get('x-session-id') || crypto.randomUUID();

    if (!userId || !tenantId) {
      return NextResponse.json(
        { success: false, data: null, error: 'Unauthorized — missing auth headers' },
        { status: 401 },
      );
    }

    const body: unknown = await request.json();
    const parsed = subscribeSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          data: null,
          error: parsed.error.errors
            .map((e) => `${e.path.join('.')}: ${e.message}`)
            .join('; '),
        },
        { status: 400, headers: { 'X-Request-Id': requestId } },
      );
    }

    const service = getPushNotificationService();
    const subscription = await service.subscribeUser(
      userId,
      tenantId,
      {
        endpoint: parsed.data.endpoint,
        keys: parsed.data.keys,
      },
      parsed.data.userAgent ?? null,
    );

    return NextResponse.json(
      {
        success: true,
        data: subscription,
        error: null,
      },
      {
        status: 201,
        headers: { 'X-Request-Id': requestId },
      },
    );
  } catch (error) {
    console.error('[api/notifications/subscribe] POST error:', error);
    return NextResponse.json(
      { success: false, data: null, error: 'Internal server error' },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/notifications/subscribe
// ---------------------------------------------------------------------------

/**
 * DELETE /api/notifications/subscribe
 *
 * Remove a push notification subscription by endpoint.
 *
 * Authentication: Requires x-user-id and x-tenant-id headers.
 *
 * Body: { endpoint }
 *
 * Response: { success: true, data: { removed: boolean } }
 */
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  try {
    const userId = request.headers.get('x-user-id');
    const tenantId = request.headers.get('x-tenant-id');
    const requestId = request.headers.get('x-session-id') || crypto.randomUUID();

    if (!userId || !tenantId) {
      return NextResponse.json(
        { success: false, data: null, error: 'Unauthorized — missing auth headers' },
        { status: 401 },
      );
    }

    const body: unknown = await request.json();
    const parsed = unsubscribeSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          data: null,
          error: parsed.error.errors
            .map((e) => `${e.path.join('.')}: ${e.message}`)
            .join('; '),
        },
        { status: 400, headers: { 'X-Request-Id': requestId } },
      );
    }

    const service = getPushNotificationService();
    const removed = await service.unsubscribeUser(parsed.data.endpoint);

    return NextResponse.json(
      {
        success: true,
        data: { removed },
        error: null,
      },
      {
        status: 200,
        headers: { 'X-Request-Id': requestId },
      },
    );
  } catch (error) {
    console.error('[api/notifications/subscribe] DELETE error:', error);
    return NextResponse.json(
      { success: false, data: null, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
