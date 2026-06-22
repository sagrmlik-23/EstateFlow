// ============================================================================
// EstateFlow CRM — Notification Preferences API
// GET  /api/notifications/preferences  — Get preferences
// PATCH /api/notifications/preferences — Update preferences
// Agent-4-6-Notification-Preferences v1.0.0
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { getNotificationPreferencesService } from '@/lib/notification';

// ---------------------------------------------------------------------------
// GET /api/notifications/preferences
// ---------------------------------------------------------------------------

/**
 * GET /api/notifications/preferences
 *
 * Fetch notification preferences for the authenticated user.
 *
 * Authentication: Requires x-user-id and x-tenant-id headers.
 *
 * Response: { success: true, data: NotificationPreference }
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
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

    const service = getNotificationPreferencesService();
    const preferences = await service.getPreferences(userId, tenantId);

    return NextResponse.json(
      {
        success: true,
        data: preferences,
        error: null,
      },
      {
        status: 200,
        headers: { 'X-Request-Id': requestId },
      },
    );
  } catch (error) {
    console.error('[api/notifications/preferences] GET error:', error);
    return NextResponse.json(
      { success: false, data: null, error: 'Internal server error' },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/notifications/preferences
// ---------------------------------------------------------------------------

/**
 * PATCH /api/notifications/preferences
 *
 * Update notification preferences. Supports two actions:
 *   1. Toggle a channel: { channel: "email", enabled: true }
 *   2. Set quiet hours:  { quietHours: { enabled, start, end, timezone } }
 *
 * Authentication: Requires x-user-id and x-tenant-id headers.
 *
 * Response: { success: true, data: NotificationPreference }
 */
export async function PATCH(request: NextRequest): Promise<NextResponse> {
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

    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { success: false, data: null, error: 'Request body is required' },
        { status: 400, headers: { 'X-Request-Id': requestId } },
      );
    }

    const service = getNotificationPreferencesService();
    const payload = body as Record<string, unknown>;

    let preferences;

    // ── Toggle channel preference ───────────────────────────────────────────
    if (payload.channel !== undefined && payload.enabled !== undefined) {
      const parsed = service.validateUpdatePreference(body);
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

      preferences = await service.updatePreference(
        userId,
        tenantId,
        parsed.data.channel,
        parsed.data.enabled,
      );
    }

    // ── Set quiet hours ────────────────────────────────────────────────────
    else if (payload.quietHours !== undefined) {
      const parsed = service.validateSetQuietHours(payload.quietHours);
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

      preferences = await service.setQuietHours(
        userId,
        tenantId,
        parsed.data,
      );
    }

    else {
      return NextResponse.json(
        {
          success: false,
          data: null,
          error: 'Invalid payload. Send { channel, enabled } or { quietHours }.',
        },
        { status: 400, headers: { 'X-Request-Id': requestId } },
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: preferences,
        error: null,
      },
      {
        status: 200,
        headers: { 'X-Request-Id': requestId },
      },
    );
  } catch (error) {
    console.error('[api/notifications/preferences] PATCH error:', error);
    return NextResponse.json(
      { success: false, data: null, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
