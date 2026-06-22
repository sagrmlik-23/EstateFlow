// ============================================================================
// EstateFlow CRM — Create Subscription API
// Agent-7-Payments v1.0.0
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { authenticate } from '@/middleware';
import { withRateLimit } from '@/lib/security/rateLimiter';
import { createSubscription } from '@/lib/payments/razorpay';
import { getTier } from '@/lib/payments/pricing';

/**
 * POST /api/payments/create-subscription
 *
 * Creates a new Razorpay subscription for a tenant.
 *
 * Request body:
 *   { tenantId: string, tierId: string, billingCycle?: 'monthly' | 'annual', couponCode?: string }
 *
 * Response:
 *   200: { success: true, data: { subscriptionId, razorpaySubscriptionId, shortUrl } }
 *   400: { success: false, error: string }
 *   401: { success: false, error: 'Unauthorized' }
 *   403: { success: false, error: 'Forbidden' }
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

    // Only super_admin and tenant_admin can manage subscriptions
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

    // ── Parse Request Body ───────────────────────────────────────────────
    const body = await request.json();
    const { tenantId, tierId, billingCycle = 'monthly', couponCode } = body;

    if (!tenantId || !tierId) {
      return NextResponse.json(
        { success: false, error: 'tenantId and tierId are required' },
        { status: 400 },
      );
    }

    // Validate tier
    const tier = getTier(tierId);
    if (!tier) {
      return NextResponse.json(
        { success: false, error: `Invalid tier: ${tierId}` },
        { status: 400 },
      );
    }

    // Validate billing cycle
    if (billingCycle !== 'monthly' && billingCycle !== 'annual') {
      return NextResponse.json(
        { success: false, error: 'billingCycle must be "monthly" or "annual"' },
        { status: 400 },
      );
    }

    // ── Create Subscription ──────────────────────────────────────────────
    const result = await createSubscription(tenantId, tierId, billingCycle, couponCode);

    return NextResponse.json(
      {
        success: true,
        data: {
          subscriptionId: result.subscriptionId,
          razorpaySubscriptionId: result.razorpaySubscriptionId,
          shortUrl: result.shortUrl,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    console.error('[payments/create-subscription]', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
