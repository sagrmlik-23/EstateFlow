'use client';

// ============================================================================
// EstateFlow CRM — Tenant Billing Settings Page
// Agent-7-Payments v1.0.0
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  CreditCard,
  DollarSign,
  Calendar,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  ArrowUpDown,
  Download,
  ChevronRight,
  Zap,
  Crown,
  Building2,
  Star,
} from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { formatPrice, formatDate } from '@/lib/utils';
import type {
  PricingTier,
  PaymentRecord,
  Invoice,
  BillingCycle,
} from '@/types/billing';
import { DEFAULT_TIERS } from '@/lib/payments/pricing';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TenantInfo {
  id: string;
  name: string;
  plan: string;
  status: string;
  billing_email: string | null;
  razorpay_subscription_id: string | null;
  setup_fee_paid: boolean;
  current_period_start: string | null;
  current_period_end: string | null;
  negotiated_discount: number | null;
}

// ---------------------------------------------------------------------------
// Tier Badge Helper
// ---------------------------------------------------------------------------

const TIER_ICONS: Record<string, React.ReactNode> = {
  free: <Star className="h-5 w-5" />,
  starter: <Zap className="h-5 w-5" />,
  professional: <Crown className="h-5 w-5" />,
  enterprise: <Building2 className="h-5 w-5" />,
};

const TIER_COLORS: Record<string, string> = {
  free: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  starter: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  professional:
    'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  enterprise:
    'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
};

// ---------------------------------------------------------------------------
// Status Badge Variant Helper
// ---------------------------------------------------------------------------

function getStatusBadgeVariant(status: string): string {
  switch (status) {
    case 'paid':
    case 'active':
      return 'success';
    case 'pending':
    case 'trialing':
      return 'warning';
    case 'failed':
    case 'cancelled':
    case 'past_due':
      return 'danger';
    default:
      return 'secondary';
  }
}

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------

export default function BillingSettingsPage() {
  const params = useParams();
  const tenant = params.tenant as string;

  const [tenantInfo, setTenantInfo] = useState<TenantInfo | null>(null);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ── Fetch tenant & billing data ──────────────────────────────────────────

  const fetchBillingData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch tenant info
      const tenantRes = await fetch(`/api/tenants?slug=${tenant}`, {
        headers: {
          'x-tenant-id': tenant,
        },
      });
      const tenantJson = await tenantRes.json();
      if (tenantJson.success) {
        setTenantInfo(tenantJson.data);
      }

      // Fetch payment history
      const paymentRes = await fetch(
        `/api/payments/invoices?tenantId=${tenant}`,
        {
          headers: {
            'x-tenant-id': tenant,
          },
        },
      );
      const paymentJson = await paymentRes.json();
      if (paymentJson.success) {
        setInvoices(paymentJson.data || []);
        // Also populate payments from invoices
        const records: PaymentRecord[] = (paymentJson.data || []).map(
          (inv: Invoice) => ({
            id: inv.id,
            tenantId: inv.tenantId,
            plan: inv.planName,
            amount: inv.amount,
            status: inv.status,
            razorpaySubscriptionId: inv.razorpayPaymentId,
            razorpayPaymentId: inv.razorpayPaymentId,
            paidAt: inv.paidAt,
            retryCount: 0,
            createdAt: inv.createdAt,
          }),
        );
        setPayments(records);
      }
    } catch (err) {
      console.error('Failed to fetch billing data:', err);
      setError('Failed to load billing information');
    } finally {
      setLoading(false);
    }
  }, [tenant]);

  useEffect(() => {
    fetchBillingData();
  }, [fetchBillingData]);

  // ── Handle plan change ────────────────────────────────────────────────────

  const handleSubscribe = async (tierId: string) => {
    try {
      setSubscribing(tierId);
      setError(null);

      const res = await fetch('/api/payments/create-subscription', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': tenant,
        },
        body: JSON.stringify({
          tenantId: tenant,
          tierId,
          billingCycle: 'monthly',
        }),
      });

      const json = await res.json();

      if (json.success && json.data?.shortUrl) {
        // Redirect to Razorpay checkout
        window.open(json.data.shortUrl, '_blank');
        // Refresh data after subscription
        setTimeout(fetchBillingData, 5000);
      } else {
        setError(json.error || 'Failed to create subscription');
      }
    } catch (err) {
      console.error('Failed to subscribe:', err);
      setError('Failed to create subscription');
    } finally {
      setSubscribing(null);
    }
  };

  // ── Loading State ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── Current Plan ──────────────────────────────────────────────────────────

  const currentTier = DEFAULT_TIERS.find(
    (t) => t.id === (tenantInfo?.plan || 'free'),
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Billing</h1>
        <p className="text-muted-foreground mt-1">
          Manage your subscription, view invoices, and change your plan.
        </p>
      </div>

      {/* Error Display */}
      {error && (
        <Card className="border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900">
          <CardContent className="flex items-center gap-3 pt-6">
            <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
            <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
            <Button
              variant="outline"
              size="sm"
              className="ml-auto"
              onClick={() => setError(null)}
            >
              Dismiss
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── Current Plan Card ──────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {currentTier && TIER_ICONS[currentTier.id]}
            Current Plan
          </CardTitle>
          <CardDescription>
            Your current subscription plan and billing details
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Plan Badge & Name */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className={`flex h-14 w-14 items-center justify-center rounded-xl ${
                  TIER_COLORS[currentTier?.id || 'free']
                }`}
              >
                {currentTier && TIER_ICONS[currentTier.id]}
              </div>
              <div>
                <h3 className="text-xl font-semibold">
                  {currentTier?.name || 'Unknown'} Plan
                </h3>
                <p className="text-sm text-muted-foreground">
                  {currentTier?.displayPrice || 'Free'}
                </p>
              </div>
            </div>
            <Badge
              variant={
                tenantInfo?.status
                  ? (getStatusBadgeVariant(tenantInfo.status) as any)
                  : 'secondary'
              }
            >
              {tenantInfo?.status || 'unknown'}
            </Badge>
          </div>

          {/* Discount Display */}
          {tenantInfo?.negotiated_discount &&
            tenantInfo.negotiated_discount > 0 && (
              <div className="rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 p-4">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                  <span className="text-sm font-medium text-green-700 dark:text-green-400">
                    Custom negotiated pricing active —
                    {tenantInfo.negotiated_discount}% discount applied
                  </span>
                </div>
              </div>
            )}

          <Separator />

          {/* Subscription Details */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                Subscription ID
              </p>
              <p className="text-sm font-mono">
                {tenantInfo?.razorpay_subscription_id || 'N/A'}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                Current Period Start
              </p>
              <p className="text-sm">
                {tenantInfo?.current_period_start
                  ? formatDate(tenantInfo.current_period_start)
                  : 'N/A'}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                Current Period End
              </p>
              <p className="text-sm">
                {tenantInfo?.current_period_end
                  ? formatDate(tenantInfo.current_period_end)
                  : 'N/A'}
              </p>
            </div>
          </div>

          {tenantInfo?.razorpay_subscription_id && (
            <div className="flex gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  handleSubscribe(tenantInfo?.plan || 'free')
                }
              >
                <CreditCard className="h-4 w-4 mr-2" />
                Manage in Razorpay
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Plan Selection ─────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowUpDown className="h-5 w-5" />
            Change Plan
          </CardTitle>
          <CardDescription>
            Upgrade or downgrade your subscription plan
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {DEFAULT_TIERS.map((tier) => {
              const isCurrentPlan = tier.id === (tenantInfo?.plan || 'free');
              return (
                <Card
                  key={tier.id}
                  className={`relative overflow-hidden transition-all ${
                    isCurrentPlan
                      ? 'ring-2 ring-primary'
                      : 'hover:border-primary/50 hover:shadow-md'
                  } ${tier.popular ? 'border-primary/50' : ''}`}
                >
                  {/* Popular Badge */}
                  {tier.popular && !isCurrentPlan && (
                    <div className="absolute top-0 right-0">
                      <div className="bg-primary text-primary-foreground text-[10px] font-semibold px-3 py-0.5 rounded-bl-lg">
                        POPULAR
                      </div>
                    </div>
                  )}

                  <CardHeader className="pb-4">
                    <CardTitle className="text-lg flex items-center gap-2">
                      {TIER_ICONS[tier.id]}
                      {tier.name}
                    </CardTitle>
                    <CardDescription>
                      <span className="text-2xl font-bold text-foreground">
                        {tier.monthlyPrice === 0
                          ? 'Free'
                          : formatPrice(tier.monthlyPrice)}
                      </span>
                      {tier.monthlyPrice > 0 && (
                        <span className="text-sm text-muted-foreground">
                          /month
                        </span>
                      )}
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    {/* Features */}
                    <ul className="space-y-2">
                      {tier.features.slice(0, 5).map((feature) => (
                        <li key={feature.name} className="flex items-start gap-2 text-sm">
                          {feature.included ? (
                            <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                          ) : (
                            <XCircle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                          )}
                          <span
                            className={
                              feature.included
                                ? 'text-foreground'
                                : 'text-muted-foreground'
                            }
                          >
                            {feature.name}
                          </span>
                        </li>
                      ))}
                    </ul>

                    {/* Setup Fee */}
                    {tier.setupFee > 0 && (
                      <p className="text-xs text-muted-foreground">
                        +{formatPrice(tier.setupFee)} one-time setup fee
                      </p>
                    )}

                    {/* Action Button */}
                    <Button
                      className="w-full"
                      variant={isCurrentPlan ? 'outline' : 'default'}
                      disabled={isCurrentPlan || subscribing === tier.id}
                      onClick={() => handleSubscribe(tier.id)}
                    >
                      {subscribing === tier.id ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Processing...
                        </>
                      ) : isCurrentPlan ? (
                        'Current Plan'
                      ) : (
                        <>
                          <CreditCard className="h-4 w-4 mr-2" />
                          {tier.monthlyPrice === 0
                            ? 'Downgrade to Free'
                            : `Upgrade to ${tier.name}`}
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* ── Invoice / Payment History ──────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Invoice & Payment History
          </CardTitle>
          <CardDescription>
            View your past invoices and payment records
          </CardDescription>
        </CardHeader>
        <CardContent>
          {invoices.length === 0 ? (
            <div className="text-center py-12">
              <DollarSign className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">
                No invoices or payment records yet.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Invoices will appear once you subscribe to a paid plan.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {invoices.map((invoice) => (
                <div
                  key={invoice.id}
                  className="flex items-center justify-between p-4 rounded-lg border hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-lg ${
                        invoice.status === 'paid'
                          ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'
                          : invoice.status === 'failed'
                            ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                            : 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400'
                      }`}
                    >
                      {invoice.status === 'paid' ? (
                        <CheckCircle2 className="h-5 w-5" />
                      ) : invoice.status === 'failed' ? (
                        <XCircle className="h-5 w-5" />
                      ) : (
                        <AlertCircle className="h-5 w-5" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        {invoice.planName} Plan
                      </p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatDate(invoice.createdAt)}
                        </span>
                        {invoice.paidAt && (
                          <span>
                            Paid: {formatDate(invoice.paidAt)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-sm font-semibold">
                        {formatPrice(invoice.amount)}
                      </p>
                      <Badge
                        variant={
                          getStatusBadgeVariant(invoice.status) as any
                        }
                        className="text-[10px]"
                      >
                        {invoice.status}
                      </Badge>
                    </div>
                    <Button variant="ghost" size="icon" className="shrink-0">
                      <Download className="h-4 w-4" />
                    </Button>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
