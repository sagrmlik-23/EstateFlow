// ============================================================================
// EstateFlow CRM — VAPID Public Key API
// GET /api/notifications/vapid-public-key — Get the VAPID public key
// Agent-4-6-Notification-Preferences v1.0.0
// ============================================================================

import { NextResponse } from 'next/server';
import { getVapidKeys } from '@/lib/notification';

// ---------------------------------------------------------------------------
// GET /api/notifications/vapid-public-key
// ---------------------------------------------------------------------------

/**
 * GET /api/notifications/vapid-public-key
 *
 * Returns the VAPID public key for push notification subscription.
 * Used by the browser's PushManager.subscribe() call.
 *
 * Response: { publicKey: string }
 */
export async function GET(): Promise<NextResponse> {
  try {
    const vapidKeys = getVapidKeys();

    return NextResponse.json(
      { publicKey: vapidKeys.publicKey },
      { status: 200 },
    );
  } catch (error) {
    console.error('[api/notifications/vapid-public-key] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to get VAPID public key' },
      { status: 500 },
    );
  }
}
