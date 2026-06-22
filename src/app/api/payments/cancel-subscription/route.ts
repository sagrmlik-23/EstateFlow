// ============================================================================
// EstateFlow CRM — Cancel Subscription API
// Agent-7-Payments v1.0.0
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { authenticate } from '@/middleware';
import { withRateLimit } from '@/lib/security/rateLimiter';
import { cancelSubscription } from '@/lib/payments/razorpay';

/**
 * POST /api/payments/cancel-subscription
 *
 * Cancels a tenant's Razorpay subscription.
 *
 * Request body:
 *   { subscriptionId: string, atPeriodEnd?: boolean }
 *
 * Response:
 *   200: { success: true, data: { cancelled: true } }
 *   400: { success: false, error: string }
 *   401/403: auth errors
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // ── Authenticate ─────────────────────────────────────────────────────
    const auth = await authenticate(request);
    if (!auth) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      );
    }

    if (auth.role !== 'super_admin' && auth.role !== 'tenant_admin') {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 },
      );
    }

    // ── Rate Limit ───────────────────────────────────────────────────────
    const { result: rateLimitResult } = await withRateLimit(
      request,
      'user',
      auth.userId,
    );
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many requests. Please try again later.' },
        { status: 429 },
      );
    }

    // ── Parse Request ────────────────────────────────────────────────────
    const body = await request.json();
    const { subscriptionId, atPeriodEnd = true } = body;

    if (!subscriptionId) {
      return NextResponse.json(
        { success: false, error: 'subscriptionId is required' },
        { status: 400 },
      );
    }

    // ── Cancel Subscription ──────────────────────────────────────────────
    const result = await cancelSubscription(subscriptionId, atPeriodEnd);

    return NextResponse.json(
      { success: true, data: result },
      { status: 200 },
    );
  } catch (error) {
    console.error('[payments/cancel-subscription]', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
