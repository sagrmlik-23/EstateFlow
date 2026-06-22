// ============================================================================
// EstateFlow CRM — Setup Fee API
// Agent-7-Payments v1.0.0
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { authenticate } from '@/middleware';
import { withRateLimit } from '@/lib/security/rateLimiter';
import { chargeSetupFee } from '@/lib/payments/razorpay';
import { getTier } from '@/lib/payments/pricing';

/**
 * POST /api/payments/setup-fee
 *
 * Charges a one-time setup fee for a tenant.
 *
 * Request body:
 *   { tenantId: string, tierId: string }
 *
 * Response:
 *   200: { success: true, data: { orderId, amount, currency } }
 *   400: { success: false, error: string }
 *   401 / 403 / 429: standard auth/rate-limit errors
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
    const { tenantId, tierId } = body;

    if (!tenantId || !tierId) {
      return NextResponse.json(
        { success: false, error: 'tenantId and tierId are required' },
        { status: 400 },
      );
    }

    const tier = getTier(tierId);
    if (!tier) {
      return NextResponse.json(
        { success: false, error: `Invalid tier: ${tierId}` },
        { status: 400 },
      );
    }

    if (!tier.setupFee || tier.setupFee <= 0) {
      return NextResponse.json(
        { success: false, error: 'This tier has no setup fee' },
        { status: 400 },
      );
    }

    // ── Charge Setup Fee ─────────────────────────────────────────────────
    const result = await chargeSetupFee(tenantId, tier.setupFee, tierId);

    return NextResponse.json(
      {
        success: true,
        data: {
          orderId: result.orderId,
          amount: result.amount,
          currency: result.currency,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    console.error('[payments/setup-fee]', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
