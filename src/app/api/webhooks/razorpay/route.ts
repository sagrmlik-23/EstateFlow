// ============================================================================
// EstateFlow CRM — Razorpay Webhook Handler
// Agent-7-Payments v1.0.0
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { handleWebhook, verifyWebhookSignature } from '@/lib/payments/razorpay';

/**
 * POST /api/webhooks/razorpay
 *
 * Handles incoming Razorpay webhook events.
 *
 * Webhook events handled:
 *   - payment.captured        : successful payment
 *   - payment.failed           : failed payment
 *   - subscription.activated   : subscription activated
 *   - subscription.completed   : subscription lifecycle completed
 *   - subscription.charged     : recurring charge successful
 *   - subscription.halted      : halted after max retries
 *
 * The webhook secret is verified from RAZORPAY_WEBHOOK_SECRET env var.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // ── Read raw body for signature verification ─────────────────────────
    const body = await request.text();
    const signature = request.headers.get('x-razorpay-signature') || '';

    // ── Verify Webhook Signature ─────────────────────────────────────────
    const isValid = verifyWebhookSignature(body, signature);
    if (!isValid) {
      console.warn('[webhooks/razorpay] Invalid webhook signature');
      return NextResponse.json(
        { success: false, error: 'Invalid signature' },
        { status: 401 },
      );
    }

    // ── Parse & Handle Event ─────────────────────────────────────────────
    const payload = JSON.parse(body);
    const result = await handleWebhook(payload);

    return NextResponse.json(
      {
        success: true,
        data: result,
      },
      { status: 200 },
    );
  } catch (error) {
    console.error('[webhooks/razorpay]', error);
    // Always return 200 to Razorpay to prevent retries
    return NextResponse.json(
      { success: false, error: 'Webhook processing error' },
      { status: 200 },
    );
  }
}
