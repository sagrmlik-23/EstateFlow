// ============================================================================
// EstateFlow CRM — Invoices API
// Agent-7-Payments v1.0.0
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { authenticate } from '@/middleware';
import { withRateLimit } from '@/lib/security/rateLimiter';
import { getPaymentHistory, generateInvoice } from '@/lib/payments/razorpay';
import type { Invoice } from '@/types/billing';

/**
 * GET /api/payments/invoices?tenantId=xxx&periodStart=xxx&periodEnd=xxx
 *
 * Lists all invoices/payments for a tenant.
 *
 * Query params:
 *   tenantId (required): The tenant's UUID
 *   periodStart (optional): Start of billing period
 *   periodEnd (optional): End of billing period
 *
 * Response:
 *   200: { success: true, data: Invoice[] }
 *   400: { success: false, error: string }
 *   401: { success: false, error: 'Unauthorized' }
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // ── Authenticate ─────────────────────────────────────────────────────
    const auth = await authenticate(request);
    if (!auth) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 },
      );
    }

    // Only super_admin, tenant_admin can view invoices
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

    // ── Parse Query ──────────────────────────────────────────────────────
    const { searchParams } = new URL(request.url);
    const tenantId = searchParams.get('tenantId');

    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: 'tenantId query parameter is required' },
        { status: 400 },
      );
    }

    // Super admin can view any tenant; org_admin can only view their own tenant
    if (auth.role !== 'super_admin' && auth.tenantId !== tenantId) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Cannot view other tenant invoices' },
        { status: 403 },
      );
    }

    // ── Fetch Payment History ────────────────────────────────────────────
    const payments = await getPaymentHistory(tenantId);

    // Convert payment records to invoice format
    const invoices: Invoice[] = payments.map((payment) => ({
      id: payment.id,
      tenantId: payment.tenantId,
      amount: payment.amount,
      status: payment.status,
      dueDate: payment.createdAt,
      paidAt: payment.paidAt,
      items: [
        {
          id: `item-${payment.id}`,
          description: `${payment.plan.charAt(0).toUpperCase() + payment.plan.slice(1)} Plan Subscription`,
          quantity: 1,
          unitPrice: payment.amount,
          amount: payment.amount,
        },
      ],
      razorpayPaymentId: payment.razorpayPaymentId,
      razorpayInvoiceId: null,
      planName: payment.plan,
      billingPeriod: null,
      createdAt: payment.createdAt,
      updatedAt: payment.createdAt,
    }));

    // ── Generate current period invoice if requested ─────────────────────
    const periodStart = searchParams.get('periodStart');
    const periodEnd = searchParams.get('periodEnd');

    if (periodStart && periodEnd) {
      try {
        const currentInvoice = await generateInvoice(tenantId, {
          start: periodStart,
          end: periodEnd,
        });
        invoices.unshift(currentInvoice);
      } catch {
        // Silently skip if invoice generation fails (non-critical)
      }
    }

    return NextResponse.json(
      { success: true, data: invoices },
      { status: 200 },
    );
  } catch (error) {
    console.error('[payments/invoices]', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
