'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { PieChartIcon } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────

interface LeadDistributionProps {
  newLeads: number;
  contacted: number;
  qualified: number;
  closedWon: number;
  closedLost: number;
  hotLeads: number;
}

// ─── Colors ───────────────────────────────────────────────────────────────

const COLORS = {
  New: '#3b82f6',
  Contacted: '#8b5cf6',
  Qualified: '#f59e0b',
  'Closed Won': '#10b981',
  'Closed Lost': '#ef4444',
  Hot: '#f97316',
};

// ─── Custom Tooltip ───────────────────────────────────────────────────────

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;

  const entry = payload[0];
  return (
    <div className="rounded-lg border bg-popover p-3 shadow-md text-sm">
      <div className="flex items-center gap-2 mb-1">
        <div
          className="h-3 w-3 rounded-full"
          style={{ backgroundColor: entry.payload.color }}
        />
        <span className="font-medium">{entry.name}</span>
      </div>
      <p className="text-muted-foreground">
        {entry.value} leads{' '}
        <span className="text-xs">
          ({((entry.payload.percent) * 100).toFixed(1)}%)
        </span>
      </p>
    </div>
  );
}

// ─── Custom Legend ─────────────────────────────────────────────────────────

function CustomLegend({ payload }: any) {
  if (!payload?.length) return null;

  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-2">
      {payload.map((entry: any, idx: number) => (
        <div key={idx} className="flex items-center gap-2 text-xs">
          <div
            className="h-2.5 w-2.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-muted-foreground truncate">{entry.value}</span>
          <span className="font-medium tabular-nums ml-auto">
            {entry.payload.value}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────

function LeadDistributionEmpty() {
  return (
    <div className="rounded-xl border bg-card shadow-sm">
      <div className="px-4 py-3 border-b">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <PieChartIcon className="h-4 w-4 text-primary" />
          Lead Distribution
        </h3>
      </div>
      <div className="flex flex-col items-center justify-center py-10 text-center px-4">
        <PieChartIcon className="h-10 w-10 text-muted-foreground mb-3" />
        <p className="text-sm font-medium text-muted-foreground">No leads yet</p>
        <p className="text-xs text-muted-foreground mt-1">
          Lead distribution will appear once leads are added.
        </p>
      </div>
    </div>
  );
}

// ─── Loading Skeleton ─────────────────────────────────────────────────────

function LeadDistributionSkeleton() {
  return (
    <div className="rounded-xl border bg-card shadow-sm animate-pulse">
      <div className="px-4 py-3 border-b">
        <div className="h-5 w-36 rounded bg-muted" />
      </div>
      <div className="flex flex-col items-center py-8">
        <div className="h-40 w-40 rounded-full bg-muted mb-4" />
        <div className="space-y-1.5 w-3/4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-3 w-full rounded bg-muted" />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── LeadDistribution Component ───────────────────────────────────────────

export function LeadDistribution({
  newLeads,
  contacted,
  qualified,
  closedWon,
  closedLost,
  hotLeads,
}: LeadDistributionProps) {
  const total = newLeads + contacted + qualified + closedWon + closedLost;

  // Empty state
  if (total === 0) {
    return <LeadDistributionEmpty />;
  }

  const data = [
    { name: 'New', value: newLeads, color: COLORS.New, percent: newLeads / total },
    { name: 'Contacted', value: contacted, color: COLORS.Contacted, percent: contacted / total },
    { name: 'Qualified', value: qualified, color: COLORS.Qualified, percent: qualified / total },
    { name: 'Closed Won', value: closedWon, color: COLORS['Closed Won'], percent: closedWon / total },
    { name: 'Closed Lost', value: closedLost, color: COLORS['Closed Lost'], percent: closedLost / total },
  ].filter((d) => d.value > 0);

  return (
    <div className="rounded-xl border bg-card shadow-sm">
      {/* Header */}
      <div className="px-4 py-3 border-b flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <PieChartIcon className="h-4 w-4 text-primary" />
          Lead Distribution
        </h3>
        <div className="flex items-center gap-3">
          {/* Hot leads indicator */}
          {hotLeads > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-medium text-orange-700">
              <span className="h-1.5 w-1.5 rounded-full bg-orange-500 animate-pulse" />
              {hotLeads} hot
            </span>
          )}
          <span className="text-xs text-muted-foreground">{total} total</span>
        </div>
      </div>

      {/* Chart */}
      <div className="px-2 py-4">
        <div className="h-44 sm:h-48">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={52}
                outerRadius={74}
                paddingAngle={2}
                dataKey="value"
                strokeWidth={0}
              >
                {data.map((entry, idx) => (
                  <Cell key={idx} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              <Legend content={<CustomLegend />} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

// ─── Exports ──────────────────────────────────────────────────────────────

export { LeadDistributionSkeleton };
