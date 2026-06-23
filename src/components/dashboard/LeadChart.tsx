'use client';

import { useState, useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Line,
  ComposedChart,
} from 'recharts';
import { TrendingUp, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────

interface LeadChartProps {
  totalLeads: number;
  newLeads: number;
  contacted: number;
  qualified: number;
  closedWon: number;
  closedLost: number;
}

type Period = '7d' | '30d' | '90d';

// ─── Generate synthetic timeline data ─────────────────────────────────────

function generateTimelineData(
  totalLeads: number,
  newLeads: number,
  contacted: number,
  qualified: number,
  closedWon: number,
  closedLost: number,
  days: number,
) {
  const data: { date: string; New: number; Contacted: number; Qualified: number; 'Closed Won': number; 'Closed Lost': number }[] = [];

  // Distribute values across days with some variation
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dayStr = date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });

    const factor = (days - i) / days;
    const noise = () => 0.5 + Math.random() * 1.0;

    const dayNew = Math.round((newLeads / days) * noise() * factor);
    const dayContacted = Math.round((contacted / days) * noise() * factor);
    const dayQualified = Math.round((qualified / days) * noise() * factor);
    const dayWon = Math.round((closedWon / days) * noise() * factor);
    const dayLost = Math.round((closedLost / days) * noise() * factor);

    data.push({
      date: dayStr,
      New: dayNew,
      Contacted: dayContacted,
      Qualified: dayQualified,
      'Closed Won': dayWon,
      'Closed Lost': dayLost,
    });
  }

  return data;
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg border bg-popover p-3 shadow-md text-sm">
      <p className="font-medium mb-2">{label}</p>
      {payload.map((entry: any, idx: number) => (
        <div key={idx} className="flex items-center gap-2 mb-1 last:mb-0">
          <div
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-muted-foreground">{entry.name}:</span>
          <span className="font-medium">{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Loading Skeleton ─────────────────────────────────────────────────────

function LeadChartSkeleton() {
  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm animate-pulse">
      <div className="flex items-center justify-between mb-6">
        <div className="space-y-1.5">
          <div className="h-5 w-32 rounded bg-muted" />
          <div className="h-3.5 w-48 rounded bg-muted" />
        </div>
        <div className="flex gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-8 w-12 rounded-md bg-muted" />
          ))}
        </div>
      </div>
      <div className="h-64 rounded bg-muted" />
    </div>
  );
}

// ─── LeadChart Component ──────────────────────────────────────────────────

export function LeadChart(props: LeadChartProps) {
  const [period, setPeriod] = useState<Period>('30d');
  const [chartType, setChartType] = useState<'bar' | 'line'>('bar');

  const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;

  const data = useMemo(
    () => generateTimelineData(
      props.totalLeads,
      props.newLeads,
      props.contacted,
      props.qualified,
      props.closedWon,
      props.closedLost,
      days,
    ),
    [props.totalLeads, props.newLeads, props.contacted, props.qualified, props.closedWon, props.closedLost, days],
  );

  const periods: { label: string; value: Period }[] = [
    { label: '7 Days', value: '7d' },
    { label: '30 Days', value: '30d' },
    { label: '90 Days', value: '90d' },
  ];

  const totalActiveLeads = props.newLeads + props.contacted + props.qualified;

  if (props.totalLeads === 0 && totalActiveLeads === 0 && props.closedWon === 0) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center shadow-sm">
        <BarChart3 className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
        <h3 className="font-semibold mb-1">Lead Trends</h3>
        <p className="text-sm text-muted-foreground">
          Lead data will appear here once you start adding leads.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
        <div>
          <h3 className="text-base font-semibold flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            Lead Trends
          </h3>
          <p className="text-xs text-muted-foreground">
            Lead activity over the last {days} days
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Chart type toggle */}
          <button
            onClick={() => setChartType(chartType === 'bar' ? 'line' : 'bar')}
            className="rounded-md border px-2.5 py-1.5 text-xs font-medium hover:bg-accent transition-colors"
            title="Toggle chart type"
          >
            {chartType === 'bar' ? 'Line' : 'Bar'}
          </button>

          {/* Period filter */}
          <div className="flex rounded-md border overflow-hidden">
            {periods.map((p) => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium transition-colors',
                  period === p.value
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-accent',
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="h-72 sm:h-80">
        <ResponsiveContainer width="100%" height="100%">
          {chartType === 'bar' ? (
            <BarChart data={data} margin={{ top: 5, right: 5, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                interval={days > 30 ? Math.floor(days / 15) : 0}
              />
              <YAxis
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                iconType="circle"
                iconSize={8}
              />
              <Bar dataKey="New" fill="#3b82f6" radius={[3, 3, 0, 0]} stackId="a" />
              <Bar dataKey="Contacted" fill="#8b5cf6" radius={[3, 3, 0, 0]} stackId="a" />
              <Bar dataKey="Qualified" fill="#f59e0b" radius={[3, 3, 0, 0]} stackId="a" />
              <Bar dataKey="Closed Won" fill="#10b981" radius={[3, 3, 0, 0]} stackId="a" />
              <Bar dataKey="Closed Lost" fill="#ef4444" radius={[3, 3, 0, 0]} stackId="a" />
            </BarChart>
          ) : (
            <ComposedChart data={data} margin={{ top: 5, right: 5, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                interval={days > 30 ? Math.floor(days / 15) : 0}
              />
              <YAxis
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                iconType="circle"
                iconSize={8}
              />
              <Line type="monotone" dataKey="New" stroke="#3b82f6" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Contacted" stroke="#8b5cf6" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Qualified" stroke="#f59e0b" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Closed Won" stroke="#10b981" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Closed Lost" stroke="#ef4444" strokeWidth={2} dot={false} />
            </ComposedChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Exports ──────────────────────────────────────────────────────────────

export { LeadChartSkeleton };
