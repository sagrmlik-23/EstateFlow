'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Phone,
  PhoneCall,
  Clock,
  BarChart3,
  TrendingUp,
  PieChart,
  AlertCircle,
  RefreshCw,
  CalendarDays,
  ThumbsDown,
  MessageSquare,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
interface AnalyticsSummary {
  totalCalls: number;
  connectedCalls: number;
  connectedPercent: number;
  avgDurationSeconds: number | null;
  conversionRate: number | null;
  interestedCount: number;
  notInterestedCount: number;
  callbackCount: number;
  siteVisitCount: number;
  noAnswerCount: number;
  failedCount: number;
  topObjections: { objection: string; count: number }[];
  dailyVolume: { date: string; calls: number; connected: number }[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

// ---------------------------------------------------------------------------
// Stat Card
// ---------------------------------------------------------------------------
function StatCard({
  icon,
  label,
  value,
  sublabel,
  trend,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sublabel?: string;
  trend?: { value: number; positive: boolean };
}) {
  return (
    <Card>
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs sm:text-sm text-muted-foreground">{label}</p>
            <p className="text-xl sm:text-2xl font-bold">{value}</p>
            {sublabel && (
              <p className="text-xs text-muted-foreground">{sublabel}</p>
            )}
          </div>
          <div className="rounded-full bg-primary/10 p-2 sm:p-3 text-primary">
            {icon}
          </div>
        </div>
        {trend && (
          <div className="mt-2 flex items-center gap-1">
            <TrendingUp
              className={cn(
                'h-3 w-3',
                trend.positive ? 'text-green-500' : 'text-red-500 rotate-180'
              )}
            />
            <span
              className={cn(
                'text-xs font-medium',
                trend.positive ? 'text-green-600' : 'text-red-600'
              )}
            >
              {trend.value}% {trend.positive ? 'up' : 'down'}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Mini Bar Chart
// ---------------------------------------------------------------------------
function MiniBarChart({
  data,
  height = 120,
}: {
  data: { label: string; value: number; color?: string }[];
  height?: number;
}) {
  const maxValue = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="flex items-end gap-1 sm:gap-2" style={{ height }}>
      {data.map((item, i) => {
        const barHeight = (item.value / maxValue) * 100;
        return (
          <div
            key={i}
            className="flex-1 flex flex-col items-center gap-1"
          >
            <span className="text-[10px] text-muted-foreground">
              {item.value}
            </span>
            <div
              className="w-full rounded-sm transition-all"
              style={{
                height: `${Math.max(barHeight, 4)}%`,
                backgroundColor: item.color || 'hsl(var(--primary))',
              }}
            />
            <span className="text-[10px] text-muted-foreground truncate max-w-full">
              {item.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pie Chart (simplified)
// ---------------------------------------------------------------------------
function OutcomePieChart({
  data,
}: {
  data: { label: string; value: number; color: string }[];
}) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (total === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-muted-foreground">
        <div className="text-center">
          <PieChart className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p className="text-xs">No outcome data</p>
        </div>
      </div>
    );
  }

  // Calculate pie segments using conic gradient
  let cumulativePercent = 0;
  const gradientParts = data
    .filter((d) => d.value > 0)
    .map((d) => {
      const percent = (d.value / total) * 100;
      const start = cumulativePercent;
      cumulativePercent += percent;
      return `${d.color} ${start}% ${cumulativePercent}%`;
    });

  const gradient =
    gradientParts.length > 0
      ? `conic-gradient(${gradientParts.join(', ')})`
      : undefined;

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6">
      <div
        className="h-36 w-36 sm:h-44 sm:w-44 rounded-full shrink-0"
        style={{ background: gradient }}
      />
      <div className="space-y-2">
        {data
          .filter((d) => d.value > 0)
          .map((d) => (
            <div key={d.label} className="flex items-center gap-2 text-xs sm:text-sm">
              <span
                className="h-3 w-3 rounded-sm shrink-0"
                style={{ backgroundColor: d.color }}
              />
              <span className="text-muted-foreground">{d.label}</span>
              <span className="font-medium">
                {Math.round((d.value / total) * 100)}%
              </span>
            </div>
          ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DEFAULT DATA (used while loading or as fallback)
// ---------------------------------------------------------------------------
const DEFAULT_SUMMARY: AnalyticsSummary = {
  totalCalls: 0,
  connectedCalls: 0,
  connectedPercent: 0,
  avgDurationSeconds: null,
  conversionRate: null,
  interestedCount: 0,
  notInterestedCount: 0,
  callbackCount: 0,
  siteVisitCount: 0,
  noAnswerCount: 0,
  failedCount: 0,
  topObjections: [],
  dailyVolume: [],
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function AIAnalyticsPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const [tenant, setTenant] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState('7d');
  const [summary, setSummary] = useState<AnalyticsSummary>(DEFAULT_SUMMARY);

  // Resolve params
  useEffect(() => {
    params.then((p) => setTenant(p.tenant));
  }, [params]);

  // -------------------------------------------------------------------------
  // Fetch analytics
  // -------------------------------------------------------------------------
  const fetchAnalytics = useCallback(async () => {
    if (!tenant) return;
    setIsLoading(true);
    setError(null);

    try {
      const sp = new URLSearchParams();
      sp.set('range', dateRange);

      const res = await fetch(`/api/ai/analytics?${sp.toString()}`, {
        headers: {
          'x-user-id': 'current-user',
          'x-tenant-id': tenant,
          'x-user-role': 'org_admin',
        },
      });

      const response = await res.json();

      if (!res.ok) {
        throw new Error(response.error || 'Failed to fetch analytics');
      }

      setSummary(response.data || DEFAULT_SUMMARY);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [tenant, dateRange]);

  useEffect(() => {
    if (tenant) {
      fetchAnalytics();
    }
  }, [tenant, fetchAnalytics]);

  // -------------------------------------------------------------------------
  // Derived data for charts
  // -------------------------------------------------------------------------
  const outcomeData = [
    {
      label: 'Interested',
      value: summary.interestedCount,
      color: '#22c55e',
    },
    {
      label: 'Site Visit',
      value: summary.siteVisitCount,
      color: '#a855f7',
    },
    {
      label: 'Callback',
      value: summary.callbackCount,
      color: '#3b82f6',
    },
    {
      label: 'Not Interested',
      value: summary.notInterestedCount,
      color: '#ef4444',
    },
    {
      label: 'No Answer',
      value: summary.noAnswerCount,
      color: '#f59e0b',
    },
    {
      label: 'Failed',
      value: summary.failedCount,
      color: '#6b7280',
    },
  ];

  const dailyChartData = summary.dailyVolume.map((d) => ({
    label: new Date(d.date).toLocaleDateString('en-IN', {
      month: 'short',
      day: 'numeric',
    }),
    value: d.calls,
    color: 'hsl(var(--primary))',
  }));

  // -------------------------------------------------------------------------
  // Loading skeleton
  // -------------------------------------------------------------------------
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="animate-pulse space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="h-8 w-48 rounded bg-muted" />
                <div className="h-4 w-32 rounded bg-muted mt-2" />
              </div>
              <div className="h-10 w-32 rounded bg-muted" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-28 rounded-lg bg-muted" />
              ))}
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="h-64 rounded-lg bg-muted" />
              <div className="h-64 rounded-lg bg-muted" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Error state
  // -------------------------------------------------------------------------
  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="rounded-full bg-destructive/10 p-4 mb-4">
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
            <h3 className="text-lg font-semibold mb-1">
              Failed to load analytics
            </h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-md">
              {error}
            </p>
            <Button variant="outline" onClick={fetchAnalytics}>
              <RefreshCw className="h-4 w-4 mr-1" />
              Try Again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Main render
  // -------------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">AI Analytics</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Performance metrics and insights for your AI voice agents
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-[140px] h-9 text-sm">
                <CalendarDays className="h-3.5 w-3.5 mr-1" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="24h">Last 24 Hours</SelectItem>
                <SelectItem value="7d">Last 7 Days</SelectItem>
                <SelectItem value="30d">Last 30 Days</SelectItem>
                <SelectItem value="90d">Last 90 Days</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9"
              onClick={fetchAnalytics}
              disabled={isLoading}
            >
              <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
            </Button>
          </div>
        </div>

        {/* Stats cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={<Phone className="h-5 w-5 sm:h-6 sm:w-6" />}
            label="Total Calls"
            value={summary.totalCalls.toLocaleString()}
            sublabel={dateRange === '24h' ? 'Last 24 hours' : `Last ${dateRange}`}
          />
          <StatCard
            icon={<PhoneCall className="h-5 w-5 sm:h-6 sm:w-6" />}
            label="Connected %"
            value={`${summary.connectedPercent.toFixed(1)}%`}
            sublabel={`${summary.connectedCalls} connected`}
          />
          <StatCard
            icon={<Clock className="h-5 w-5 sm:h-6 sm:w-6" />}
            label="Avg Duration"
            value={formatDuration(summary.avgDurationSeconds)}
          />
          <StatCard
            icon={<BarChart3 className="h-5 w-5 sm:h-6 sm:w-6" />}
            label="Conversion Rate"
            value={
              summary.conversionRate !== null
                ? `${(summary.conversionRate * 100).toFixed(1)}%`
                : '—'
            }
            sublabel={
              summary.conversionRate !== null
                ? `${summary.interestedCount + summary.siteVisitCount} converted`
                : undefined
            }
          />
        </div>

        {/* Charts */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Call volume chart */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Call Volume
              </CardTitle>
            </CardHeader>
            <CardContent>
              {dailyChartData.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-muted-foreground">
                  <div className="text-center">
                    <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    <p className="text-xs">No data for selected period</p>
                  </div>
                </div>
              ) : (
                <MiniBarChart data={dailyChartData} height={140} />
              )}
            </CardContent>
          </Card>

          {/* Outcome distribution */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <PieChart className="h-4 w-4" />
                Outcome Distribution
              </CardTitle>
            </CardHeader>
            <CardContent>
              <OutcomePieChart data={outcomeData} />
            </CardContent>
          </Card>
        </div>

        {/* Top Objections */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ThumbsDown className="h-4 w-4" />
              Top Objections
            </CardTitle>
          </CardHeader>
          <CardContent>
            {summary.topObjections.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <MessageSquare className="h-8 w-8 text-muted-foreground mb-2 opacity-40" />
                <p className="text-sm text-muted-foreground">
                  No objections recorded yet
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {summary.topObjections.map((obj, i) => {
                  const maxCount = Math.max(
                    ...summary.topObjections.map((o) => o.count),
                    1
                  );
                  const barWidth = (obj.count / maxCount) * 100;

                  return (
                    <div key={i} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span>{obj.objection}</span>
                        <span className="text-muted-foreground font-medium">
                          {obj.count}
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Empty state for all analytics when no data */}
        {summary.totalCalls === 0 && !isLoading && !error && (
          <div className="flex flex-col items-center justify-center py-12 text-center border rounded-lg bg-card">
            <div className="rounded-full bg-muted p-4 mb-4">
              <BarChart3 className="h-10 w-10 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-1">No data yet</h3>
            <p className="text-sm text-muted-foreground max-w-md mb-4">
              Analytics will appear here once your AI agents start making calls.
              Create an agent and queue your first call to get started.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
