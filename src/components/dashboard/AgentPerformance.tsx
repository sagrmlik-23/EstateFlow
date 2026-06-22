'use client';

import { useState, useMemo } from 'react';
import {
  Users,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Crown,
  Medal,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AgentMetric } from '@/lib/dashboard/queries';

// ─── Types ────────────────────────────────────────────────────────────────

interface AgentPerformanceProps {
  agents: AgentMetric[];
}

type SortField = keyof Pick<
  AgentMetric,
  'agentName' | 'leadsAssigned' | 'callsMade' | 'dealsClosed' | 'conversionRate'
>;
type SortDirection = 'asc' | 'desc';

// ─── Sortable Header ──────────────────────────────────────────────────────

function SortHeader({
  label,
  field,
  currentField,
  direction,
  onSort,
  className,
}: {
  label: string;
  field: SortField;
  currentField: SortField;
  direction: SortDirection;
  onSort: (field: SortField) => void;
  className?: string;
}) {
  const isActive = currentField === field;

  return (
    <button
      onClick={() => onSort(field)}
      className={cn(
        'flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors',
        isActive && 'text-foreground',
        className,
      )}
    >
      {label}
      {isActive ? (
        direction === 'asc' ? (
          <ArrowUp className="h-3 w-3" />
        ) : (
          <ArrowDown className="h-3 w-3" />
        )
      ) : (
        <ArrowUpDown className="h-3 w-3 opacity-50" />
      )}
    </button>
  );
}

// ─── Performance Rank Badge ───────────────────────────────────────────────

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return <Crown className="h-4 w-4 text-amber-500" />;
  }
  if (rank === 2) {
    return <Medal className="h-4 w-4 text-gray-400" />;
  }
  if (rank === 3) {
    return <Medal className="h-4 w-4 text-orange-400" />;
  }
  return <span className="text-xs text-muted-foreground w-4 text-center">{rank}</span>;
}

// ─── Loading Skeleton ─────────────────────────────────────────────────────

function AgentPerformanceSkeleton() {
  return (
    <div className="rounded-xl border bg-card shadow-sm animate-pulse">
      <div className="px-4 py-3 border-b">
        <div className="h-5 w-36 rounded bg-muted" />
      </div>
      <div className="divide-y">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3">
            <div className="h-6 w-6 rounded-full bg-muted" />
            <div className="h-4 w-28 rounded bg-muted flex-1" />
            <div className="h-4 w-12 rounded bg-muted" />
            <div className="h-4 w-12 rounded bg-muted" />
            <div className="h-4 w-12 rounded bg-muted" />
            <div className="h-4 w-16 rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── AgentPerformance Component ───────────────────────────────────────────

export function AgentPerformance({ agents }: AgentPerformanceProps) {
  const [sortField, setSortField] = useState<SortField>('dealsClosed');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const handleSort = (field: SortField) => {
    if (field === sortField) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const sortedAgents = useMemo(() => {
    return [...agents].sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      const modifier = sortDirection === 'asc' ? 1 : -1;

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return aVal.localeCompare(bVal) * modifier;
      }
      return ((aVal as number) - (bVal as number)) * modifier;
    });
  }, [agents, sortField, sortDirection]);

  // Empty state
  if (agents.length === 0) {
    return (
      <div className="rounded-xl border bg-card shadow-sm">
        <div className="px-4 py-3 border-b">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            Agent Performance
          </h3>
        </div>
        <div className="flex flex-col items-center justify-center py-10 text-center px-4">
          <Users className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-sm font-medium text-muted-foreground">No agents found</p>
          <p className="text-xs text-muted-foreground mt-1">
            Agent performance metrics will appear once agents are assigned.
          </p>
        </div>
      </div>
    );
  }

  const topDeals = Math.max(...agents.map((a) => a.dealsClosed), 1);

  return (
    <div className="rounded-xl border bg-card shadow-sm">
      {/* Header */}
      <div className="px-4 py-3 border-b flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          Agent Performance
        </h3>
        <span className="text-xs text-muted-foreground">{agents.length} agents</span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          {/* Table Header */}
          <thead>
            <tr className="border-b bg-muted/30">
              <th className="px-3 py-2.5 text-left w-8">#</th>
              <th className="px-3 py-2.5 text-left">
                <SortHeader
                  label="Agent"
                  field="agentName"
                  currentField={sortField}
                  direction={sortDirection}
                  onSort={handleSort}
                />
              </th>
              <th className="px-3 py-2.5 text-right">
                <SortHeader
                  label="Leads"
                  field="leadsAssigned"
                  currentField={sortField}
                  direction={sortDirection}
                  onSort={handleSort}
                />
              </th>
              <th className="px-3 py-2.5 text-right hidden sm:table-cell">
                <SortHeader
                  label="Calls"
                  field="callsMade"
                  currentField={sortField}
                  direction={sortDirection}
                  onSort={handleSort}
                />
              </th>
              <th className="px-3 py-2.5 text-right">
                <SortHeader
                  label="Deals"
                  field="dealsClosed"
                  currentField={sortField}
                  direction={sortDirection}
                  onSort={handleSort}
                />
              </th>
              <th className="px-3 py-2.5 text-right">
                <SortHeader
                  label="Conv. Rate"
                  field="conversionRate"
                  currentField={sortField}
                  direction={sortDirection}
                  onSort={handleSort}
                />
              </th>
            </tr>
          </thead>

          {/* Table Body */}
          <tbody className="divide-y">
            {sortedAgents.map((agent, idx) => {
              const rank = idx + 1;
              const isTopPerformer = agent.dealsClosed === topDeals && topDeals > 0;
              const barWidth = Math.min((agent.dealsClosed / topDeals) * 100, 100);

              return (
                <tr
                  key={agent.agentId}
                  className={cn(
                    'transition-colors hover:bg-accent/50',
                    isTopPerformer && 'bg-amber-50/50',
                  )}
                >
                  <td className="px-3 py-3">
                    <RankBadge rank={rank} />
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate max-w-[120px] sm:max-w-[160px]">
                        {agent.agentName}
                      </span>
                      {isTopPerformer && (
                        <span className="inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                          Top
                        </span>
                      )}
                    </div>
                    {/* Mini bar showing deal performance */}
                    <div className="mt-1 h-1.5 w-full max-w-[120px] rounded-full bg-muted">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all',
                          isTopPerformer ? 'bg-amber-400' : 'bg-primary/40',
                        )}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums font-medium">
                    {agent.leadsAssigned}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-muted-foreground hidden sm:table-cell">
                    {agent.callsMade}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums font-medium">
                    {agent.dealsClosed}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    <span
                      className={cn(
                        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                        agent.conversionRate >= 50
                          ? 'bg-emerald-100 text-emerald-700'
                          : agent.conversionRate >= 25
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-gray-100 text-gray-700',
                      )}
                    >
                      {agent.conversionRate}%
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Exports ──────────────────────────────────────────────────────────────

export { AgentPerformanceSkeleton };
