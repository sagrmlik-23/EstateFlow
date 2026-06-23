import { Suspense } from 'react';
import { RefreshCw } from 'lucide-react';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { StatsCards } from '@/components/dashboard/StatsCards';
import { LeadChart } from '@/components/dashboard/LeadChart';
import { RecentActivity } from '@/components/dashboard/RecentActivity';
import { AgentPerformance } from '@/components/dashboard/AgentPerformance';
import { LeadDistribution } from '@/components/dashboard/LeadDistribution';
import { QuickActions } from '@/components/dashboard/QuickActions';
import type { DashboardStats } from '@/lib/dashboard/queries';
import { resolveTenantId } from '@/lib/routing/resolveTenantId';

// ─── Types ────────────────────────────────────────────────────────────────

interface DashboardPageProps {
  params: Promise<{ tenant: string }>;
  searchParams?: Promise<{ refresh?: string }>;
}

// ─── Fetch Helpers ────────────────────────────────────────────────────────

async function fetchDashboardStats(tenant: string): Promise<DashboardStats | null> {
  try {
    // In production, use the API route:
    //   const res = await fetch(
    //     `${process.env.NEXT_PUBLIC_APP_URL}/api/dashboard/stats`,
    //     { headers: { Authorization: `Bearer ${...}` } },
    //   );
    //   const json = await res.json();
    //   return json.data;
    //
    // For now, use the server-side query directly:
    const { getDashboardStats } = await import('@/lib/dashboard/queries');
    return await getDashboardStats(tenant);
  } catch (error) {
    console.error('[dashboard/page] Failed to fetch stats:', error);
    return null;
  }
}

async function fetchRecentActivity(tenant: string) {
  try {
    const { getRecentActivity } = await import('@/lib/dashboard/queries');
    return await getRecentActivity(tenant, 10);
  } catch (error) {
    console.error('[dashboard/page] Failed to fetch recent activity:', error);
    return [];
  }
}

async function fetchAgentStats(tenant: string) {
  try {
    const { getAgentStats } = await import('@/lib/dashboard/queries');
    return await getAgentStats(tenant);
  } catch (error) {
    console.error('[dashboard/page] Failed to fetch agent stats:', error);
    return [];
  }
}

// ─── Loading State ────────────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      {/* Page header skeleton */}
      <div className="flex items-center justify-between">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="h-9 w-24 animate-pulse rounded bg-muted" />
      </div>

      {/* Stats cards skeleton */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-32 animate-pulse rounded-xl bg-card shadow-sm" />
        ))}
      </div>

      {/* Main content skeleton */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <div className="h-80 animate-pulse rounded-xl bg-card shadow-sm" />
          <div className="h-72 animate-pulse rounded-xl bg-card shadow-sm" />
        </div>
        <div className="space-y-6">
          <div className="h-72 animate-pulse rounded-xl bg-card shadow-sm" />
          <div className="h-64 animate-pulse rounded-xl bg-card shadow-sm" />
          <div className="h-48 animate-pulse rounded-xl bg-card shadow-sm" />
        </div>
      </div>
    </div>
  );
}

// ─── Error State ──────────────────────────────────────────────────────────

function DashboardError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
      <div className="rounded-full bg-destructive/10 p-4 mb-4">
        <RefreshCw className="h-8 w-8 text-destructive" />
      </div>
      <h2 className="text-xl font-semibold mb-2">Failed to load dashboard</h2>
      <p className="text-muted-foreground mb-6 max-w-md">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          Retry
        </button>
      )}
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────

function DashboardEmpty() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
      <div className="rounded-full bg-muted p-6 mb-4">
        <RefreshCw className="h-10 w-10 text-muted-foreground" />
      </div>
      <h2 className="text-xl font-semibold mb-2">Welcome to EstateFlow</h2>
      <p className="text-muted-foreground mb-2 max-w-md">
        Your dashboard is ready. Start by adding your first lead or property to see analytics here.
      </p>
      <p className="text-sm text-muted-foreground">
        Stats, activity, and agent performance will populate automatically as you use the CRM.
      </p>
    </div>
  );
}

// ─── Dashboard Content (Server Component) ─────────────────────────────────

async function DashboardContent({ tenant, searchParams: _searchParams }: { tenant: string; searchParams?: { refresh?: string } }) {
  const tenantId = await resolveTenantId(tenant);
  const [stats, recentActivity, agentStats] = await Promise.all([
    fetchDashboardStats(tenantId),
    fetchRecentActivity(tenantId),
    fetchAgentStats(tenantId),
  ]);

  // Agent stats → convert to AgentMetric for the component
  const agentMetrics: import('@/lib/dashboard/queries').AgentMetric[] = agentStats.map(a => ({
    agentId: a.id,
    agentName: a.fullName,
    leadsAssigned: a.leadCount,
    callsMade: 0,
    dealsClosed: a.wonDeals,
    conversionRate: 0,
    revenueGenerated: a.totalDealValue,
  }));
  if (!stats && recentActivity.length === 0 && agentStats.length === 0) {
    return <DashboardError message="Unable to load dashboard data. Please check your connection and try again." />;
  }

  // If everything is empty (no data seeded), show empty state
  const isEmpty =
    stats?.leads.total === 0 &&
    stats?.properties.total === 0 &&
    stats?.agents.totalAgents === 0 &&
    recentActivity.length === 0;

  if (isEmpty) {
    return <DashboardEmpty />;
  }

  return (
    <DashboardLayout>
      {/* Stats Cards */}
      <div className="col-span-full">
        <StatsCards
          totalLeads={stats?.leads.total ?? 0}
          newToday={stats?.leads.today ?? 0}
          hotLeads={stats?.leads.hot ?? 0}
          conversionRate={stats?.leads.conversionRate ?? 0}
          newTodayChange={stats?.leads.thisWeek ? Math.round(((stats.leads.today - (stats.leads.thisWeek / 7)) / Math.max((stats.leads.thisWeek / 7), 1)) * 100) : 0}
          conversionChange={stats?.revenue.periodComparison.monthOverMonth ?? 0}
        />
      </div>

      {/* Main Chart */}
      <div className="lg:col-span-2">
        <LeadChart
          totalLeads={stats?.leads.total ?? 0}
          newLeads={stats?.leads.new ?? 0}
          contacted={stats?.leads.contacted ?? 0}
          qualified={stats?.leads.qualified ?? 0}
          closedWon={stats?.leads.closedWon ?? 0}
          closedLost={stats?.leads.closedLost ?? 0}
        />
      </div>

      {/* Lead Distribution */}
      <div className="lg:col-span-1">
        <LeadDistribution
          newLeads={stats?.leads.new ?? 0}
          contacted={stats?.leads.contacted ?? 0}
          qualified={stats?.leads.qualified ?? 0}
          closedWon={stats?.leads.closedWon ?? 0}
          closedLost={stats?.leads.closedLost ?? 0}
          hotLeads={stats?.leads.hot ?? 0}
        />
      </div>

      {/* Recent Activity */}
      <div className="lg:col-span-1">
        <RecentActivity initialActivities={recentActivity} tenantId={tenant} />
      </div>

      {/* Agent Performance */}
      <div className="lg:col-span-2">
        <AgentPerformance agents={agentMetrics} />
      </div>

      {/* Quick Actions */}
      <div className="col-span-full">
        <QuickActions />
      </div>
    </DashboardLayout>
  );
}

// ─── Page Component ───────────────────────────────────────────────────────

export default async function DashboardPage({ params, searchParams }: DashboardPageProps) {
  const { tenant } = await params;
  const sp = searchParams ? await searchParams : undefined;

  return (
    <div className="min-h-screen bg-background">
      {/* Page Header */}
      <div className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur-sm">
        <div className="flex items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
            <p className="text-sm text-muted-foreground hidden sm:block">
              Overview of your real estate pipeline and team performance
            </p>
          </div>
          <form method="GET">
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-lg border bg-card px-4 py-2 text-sm font-medium hover:bg-accent transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
          </form>
        </div>
      </div>

      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardContent tenant={tenant} searchParams={sp} />
      </Suspense>
    </div>
  );
}
