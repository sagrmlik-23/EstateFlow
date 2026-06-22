// ============================================================================
// EstateFlow CRM — Billing Dashboard API (Super Admin)
// Agent-7-Payments v1.0.0
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { authenticate } from '@/middleware';
import { withRateLimit } from '@/lib/security/rateLimiter';
import { createClient } from '@supabase/supabase-js';
import { DEFAULT_TIERS } from '@/lib/payments/pricing';
import type { BillingDashboard, RevenueByTier } from '@/types/billing';

/**
 * GET /api/payments/billing
 *
 * Returns aggregated billing dashboard stats for super admin.
 *
 * Response:
 *   200: { success: true, data: BillingDashboard }
 *   401/403: auth errors
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

    // Only super_admin can view billing dashboard
    if (auth.role !== 'super_admin') {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Super admin only' },
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

    // ── Fetch Billing Stats ──────────────────────────────────────────────
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!,
    );

    // Get all tenants
    const { data: tenants, error: tenantError } = await supabase
      .from('tenants')
      .select('id, plan, status, created_at');

    if (tenantError) {
      throw new Error(`Failed to fetch tenants: ${tenantError.message}`);
    }

    // Get failed payments count
    const { count: failedPayments, error: failedError } = await supabase
      .from('tenant_billing')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'failed');

    if (failedError) {
      console.warn('[billing] Failed to get failed payments:', failedError.message);
    }

    // Get total collected amount
    const { data: paidRecords, error: paidError } = await supabase
      .from('tenant_billing')
      .select('amount')
      .eq('status', 'paid');

    if (paidError) {
      console.warn('[billing] Failed to get paid records:', paidError.message);
    }

    // ── Compute Dashboard Stats ──────────────────────────────────────────
    const activeTenants = tenants?.filter((t) => t.status === 'active') || [];
    const totalTenants = tenants?.length || 0;

    // Revenue by tier
    const revenueByTierMap = new Map<string, RevenueByTier>();
    for (const tier of DEFAULT_TIERS) {
      const tierTenants = activeTenants.filter((t) => t.plan === tier.id);
      const count = tierTenants.length;

      revenueByTierMap.set(tier.id, {
        tierId: tier.id,
        tierName: tier.name,
        count,
        monthlyRevenue: count * tier.monthlyPrice,
        annualRevenue: count * tier.annualPrice,
      });
    }

    const revenueByTier = Array.from(revenueByTierMap.values());

    // MRR (Monthly Recurring Revenue)
    const totalMrr = revenueByTier.reduce(
      (sum, tier) => sum + tier.monthlyRevenue,
      0,
    );

    // ARR (Annual Recurring Revenue)
    const totalArr = totalMrr * 12;

    // Churn rate (simplified: cancelled / total)
    const cancelledTenants =
      tenants?.filter((t) => t.status === 'cancelled').length || 0;
    const churnRate =
      totalTenants > 0
        ? Math.round((cancelledTenants / totalTenants) * 10000) / 100
        : 0;

    // Average revenue per tenant
    const avgRevenuePerTenant =
      activeTenants.length > 0
        ? Math.round(totalMrr / activeTenants.length)
        : 0;

    // Upcoming renewals (tenants with period ending within 7 days)
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

    const { data: upcomingTenants } = await supabase
      .from('tenants')
      .select('id')
      .not('current_period_end', 'is', null)
      .lte('current_period_end', sevenDaysFromNow.toISOString())
      .gte('current_period_end', new Date().toISOString());

    const upcomingRenewals = upcomingTenants?.length || 0;

    // Total collected
    const totalCollected =
      paidRecords?.reduce(
        (sum, record) => sum + Number(record.amount),
        0,
      ) || 0;

    const dashboard: BillingDashboard = {
      totalMrr,
      totalArr,
      activeTenants: activeTenants.length,
      churnRate,
      avgRevenuePerTenant,
      revenueByTier,
      failedPayments: failedPayments || 0,
      upcomingRenewals,
      totalCollected,
      periodStart: new Date(
        new Date().getFullYear(),
        new Date().getMonth(),
        1,
      ).toISOString(),
      periodEnd: new Date(
        new Date().getFullYear(),
        new Date().getMonth() + 1,
        0,
      ).toISOString(),
    };

    return NextResponse.json(
      { success: true, data: dashboard },
      { status: 200 },
    );
  } catch (error) {
    console.error('[payments/billing]', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
