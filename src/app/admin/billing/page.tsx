'use client';

// ============================================================================
// EstateFlow CRM — Super Admin Billing Dashboard
// Agent-7-Payments v1.0.0
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import {
  DollarSign,
  TrendingUp,
  Users,
  AlertTriangle,
  Calendar,
  RefreshCw,
  Loader2,
  Download,
  CreditCard,
  Building2,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  MoreVertical,
  Search,
  ChevronRight,
  CheckCircle2,
  XCircle,
} from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { formatPrice, formatDate } from '@/lib/utils';
import type { BillingDashboard, Invoice, RevenueByTier } from '@/types/billing';
import { DEFAULT_TIERS } from '@/lib/payments/pricing';

// ---------------------------------------------------------------------------
// Stat Card Component
// ---------------------------------------------------------------------------

function StatCard({
  title,
  value,
  subtitle,
  icon,
  trend,
  trendUp,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ReactNode;
  trend?: string;
  trendUp?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
          {icon}
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {subtitle && (
          <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
        )}
        {trend && (
          <div className="flex items-center gap-1 mt-2">
            {trendUp ? (
              <ArrowUpRight className="h-3 w-3 text-green-500" />
            ) : (
              <ArrowDownRight className="h-3 w-3 text-red-500" />
            )}
            <span
              className={`text-xs font-medium ${
                trendUp ? 'text-green-500' : 'text-red-500'
              }`}
            >
              {trend}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Status Badge Helper
// ---------------------------------------------------------------------------

function getStatusBadgeVariant(status: string): string {
  switch (status) {
    case 'active':
      return 'success';
    case 'trialing':
    case 'pending':
      return 'warning';
    case 'suspended':
    case 'cancelled':
      return 'danger';
    default:
      return 'secondary';
  }
}

// ---------------------------------------------------------------------------
// Main Admin Billing Dashboard
// ---------------------------------------------------------------------------

export default function AdminBillingDashboard() {
  const [dashboardData, setDashboardData] = useState<BillingDashboard | null>(null);
  const [tenants, setTenants] = useState<any[]>([]);
  const [failedPayments, setFailedPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // ── Fetch Data ──────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);

      const [dashboardRes, tenantsRes, paymentsRes] = await Promise.all([
        fetch('/api/payments/billing'),
        fetch('/api/admin/tenants?limit=100'),
        fetch('/api/payments/invoices?status=failed&limit=20'),
      ]);

      const dashboardJson = await dashboardRes.json();
      if (dashboardJson.success) {
        setDashboardData(dashboardJson.data);
      }

      const tenantsJson = await tenantsRes.json();
      if (tenantsJson.success) {
        setTenants(tenantsJson.data || []);
      }

      const paymentsJson = await paymentsRes.json();
      if (paymentsJson.success) {
        setFailedPayments(paymentsJson.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch billing data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Loading State ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[500px]">
        <div className="text-center">
          <Loader2 className="h-10 w-10 animate-spin mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">Loading billing dashboard...</p>
        </div>
      </div>
    );
  }

  // ── Filtered Tenants ─────────────────────────────────────────────────────

  const filteredTenants = tenants.filter(
    (t) =>
      t.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.slug?.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Billing Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Monitor revenue, subscriptions, and payment status across all tenants
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* ── Key Metrics ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Monthly Recurring Revenue (MRR)"
          value={formatPrice(dashboardData?.totalMrr || 0)}
          subtitle="Current month"
          icon={<DollarSign className="h-4 w-4" />}
          trend="+12.5% from last month"
          trendUp
        />
        <StatCard
          title="Annual Recurring Revenue (ARR)"
          value={formatPrice(dashboardData?.totalArr || 0)}
          subtitle="Projected annual revenue"
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <StatCard
          title="Active Tenants"
          value={String(dashboardData?.activeTenants || 0)}
          subtitle={`Avg. ${formatPrice(dashboardData?.avgRevenuePerTenant || 0)}/tenant`}
          icon={<Users className="h-4 w-4" />}
        />
        <StatCard
          title="Churn Rate"
          value={`${dashboardData?.churnRate || 0}%`}
          subtitle={`${dashboardData?.upcomingRenewals || 0} renewals upcoming`}
          icon={<BarChart3 className="h-4 w-4" />}
          trend={
            (dashboardData?.churnRate || 0) < 5
              ? 'Below 5% target'
              : 'Above 5% target'
          }
          trendUp={(dashboardData?.churnRate || 0) < 5}
        />
      </div>

      {/* ── Revenue by Tier ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Revenue by Tier</CardTitle>
            <CardDescription>
              Monthly revenue breakdown by plan
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {(dashboardData?.revenueByTier || []).map((tier) => {
                const tierDef = DEFAULT_TIERS.find((t) => t.id === tier.tierId);
                const percentage =
                  (dashboardData?.totalMrr || 0) > 0
                    ? Math.round(
                        (tier.monthlyRevenue / (dashboardData?.totalMrr || 1)) *
                          100,
                      )
                    : 0;

                return (
                  <div key={tier.tierId}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">
                          {tier.tierName}
                        </span>
                        <Badge variant="secondary" className="text-[10px]">
                          {tier.count} tenants
                        </Badge>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold">
                          {formatPrice(tier.monthlyRevenue)}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {percentage}% of MRR
                        </p>
                      </div>
                    </div>
                    {/* Progress bar */}
                    <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          tier.tierId === 'free'
                            ? 'bg-gray-400'
                            : tier.tierId === 'starter'
                              ? 'bg-blue-500'
                              : tier.tierId === 'professional'
                                ? 'bg-purple-500'
                                : 'bg-amber-500'
                        }`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {(!dashboardData?.revenueByTier ||
              dashboardData.revenueByTier.length === 0) && (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No tier data available
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Quick Stats ──────────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Billing Summary</CardTitle>
            <CardDescription>
              Overview of key billing metrics
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                  Total Collected
                </p>
                <p className="text-lg font-bold">
                  {formatPrice(dashboardData?.totalCollected || 0)}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                  Failed Payments
                </p>
                <div className="flex items-center gap-2">
                  <p className="text-lg font-bold text-red-500">
                    {dashboardData?.failedPayments || 0}
                  </p>
                  {(dashboardData?.failedPayments || 0) > 0 && (
                    <AlertTriangle className="h-4 w-4 text-red-500" />
                  )}
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                  Upcoming Renewals
                </p>
                <p className="text-lg font-bold">
                  {dashboardData?.upcomingRenewals || 0}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                  Avg. Revenue / Tenant
                </p>
                <p className="text-lg font-bold">
                  {formatPrice(dashboardData?.avgRevenuePerTenant || 0)}
                </p>
              </div>
            </div>

            <Separator className="my-4" />

            {/* Period Info */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Calendar className="h-3 w-3" />
              <span>
                Period: {dashboardData?.periodStart ? formatDate(dashboardData.periodStart) : 'N/A'} -{' '}
                {dashboardData?.periodEnd ? formatDate(dashboardData.periodEnd) : 'N/A'}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Tenant Billing Status Table ────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Tenant Billing Status</CardTitle>
              <CardDescription>
                All tenants and their current billing status
              </CardDescription>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search tenants..."
                className="pl-10 w-64"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredTenants.length === 0 ? (
            <div className="text-center py-12">
              <Building2 className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">
                {searchQuery
                  ? 'No tenants match your search.'
                  : 'No tenants found.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-3 font-medium text-muted-foreground">
                      Tenant
                    </th>
                    <th className="pb-3 font-medium text-muted-foreground">
                      Plan
                    </th>
                    <th className="pb-3 font-medium text-muted-foreground">
                      Status
                    </th>
                    <th className="pb-3 font-medium text-muted-foreground">
                      Setup Fee
                    </th>
                    <th className="pb-3 font-medium text-muted-foreground">
                      Period End
                    </th>
                    <th className="pb-3 font-medium text-muted-foreground">
                      Subscription
                    </th>
                    <th className="pb-3 font-medium text-muted-foreground"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTenants.map((tenant: any) => {
                    const tierDef = DEFAULT_TIERS.find(
                      (t) => t.id === tenant.plan,
                    );
                    return (
                      <tr
                        key={tenant.id}
                        className="border-b last:border-0 hover:bg-muted/50 transition-colors"
                      >
                        <td className="py-3 pr-4">
                          <div>
                            <p className="font-medium">{tenant.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {tenant.slug}
                            </p>
                          </div>
                        </td>
                        <td className="py-3 pr-4">
                          <Badge variant="outline">
                            {tierDef?.name || tenant.plan}
                          </Badge>
                        </td>
                        <td className="py-3 pr-4">
                          <Badge
                            variant={
                              getStatusBadgeVariant(tenant.status) as any
                            }
                          >
                            {tenant.status}
                          </Badge>
                        </td>
                        <td className="py-3 pr-4">
                          {tenant.setup_fee_paid ? (
                            <span className="flex items-center gap-1 text-green-600 dark:text-green-400 text-xs">
                              <CheckCircle2 className="h-3 w-3" />
                              Paid
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-yellow-600 dark:text-yellow-400 text-xs">
                              <XCircle className="h-3 w-3" />
                              Pending
                            </span>
                          )}
                        </td>
                        <td className="py-3 pr-4 text-xs">
                          {tenant.current_period_end
                            ? formatDate(tenant.current_period_end)
                            : 'N/A'}
                        </td>
                        <td className="py-3 pr-4 text-xs font-mono">
                          {tenant.razorpay_subscription_id
                            ? tenant.razorpay_subscription_id.slice(0, 16) +
                              '...'
                            : 'N/A'}
                        </td>
                        <td className="py-3">
                          <Button variant="ghost" size="icon">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Failed Payments ────────────────────────────────────────────────── */}
      {(dashboardData?.failedPayments || 0) > 0 && (
        <Card className="border-red-200 dark:border-red-900">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              <CardTitle className="text-lg">Failed Payments</CardTitle>
            </div>
            <CardDescription>
              Recent failed payment attempts that require attention
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {failedPayments.map((payment: any) => (
                <div
                  key={payment.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900"
                >
                  <div className="flex items-center gap-3">
                    <XCircle className="h-5 w-5 text-red-500 shrink-0" />
                    <div>
                      <p className="text-sm font-medium">
                        {payment.tenantName || payment.tenant_id}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatPrice(payment.amount)} —{' '}
                        {payment.createdAt
                          ? formatDate(payment.createdAt)
                          : 'Unknown date'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="danger" className="text-[10px]">
                      Failed
                    </Badge>
                    <Button variant="outline" size="sm">
                      <CreditCard className="h-3 w-3 mr-1" />
                      Retry
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
