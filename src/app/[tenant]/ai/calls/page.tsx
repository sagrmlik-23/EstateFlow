'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import {
  Phone,
  Search,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  AlertCircle,
  Filter,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Toaster } from '@/components/ui/toaster';
import { formatDateTime } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface CallRecord {
  id: string;
  lead_id: string | null;
  ai_agent_id: string | null;
  phone: string;
  status: string;
  provider: string | null;
  outcome: string | null;
  duration_seconds: number | null;
  sentiment: string | null;
  recording_url: string | null;
  transcript: string | null;
  created_at: string;
  // Joined fields (from API)
  lead_name?: string;
  agent_name?: string;
}

interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------
const STATUS_STYLES: Record<string, string> = {
  queued: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  ringing: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  in_progress: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  completed: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  no_answer: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
  busy: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  cancelled: 'bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-400',
};

const STATUS_LABELS: Record<string, string> = {
  queued: 'Queued',
  ringing: 'Ringing',
  in_progress: 'In Progress',
  completed: 'Completed',
  failed: 'Failed',
  no_answer: 'No Answer',
  busy: 'Busy',
  cancelled: 'Cancelled',
};

const OUTCOME_LABELS: Record<string, string> = {
  interested: 'Interested',
  not_interested: 'Not Interested',
  callback: 'Callback Scheduled',
  site_visit: 'Site Visit',
  wrong_number: 'Wrong Number',
  no_answer: 'No Answer',
};

const OUTCOME_STYLES: Record<string, string> = {
  interested: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  not_interested: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  callback: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  site_visit: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  wrong_number: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
  no_answer: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
};

function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

// ---------------------------------------------------------------------------
// Filter state
// ---------------------------------------------------------------------------
interface CallFilters {
  search: string;
  status: string;
  outcome: string;
  agentId: string;
  dateFrom: string;
  dateTo: string;
}

const DEFAULT_FILTERS: CallFilters = {
  search: '',
  status: '',
  outcome: '',
  agentId: '',
  dateFrom: '',
  dateTo: '',
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function AICallsPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const [tenant, setTenant] = useState('');
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<CallFilters>(DEFAULT_FILTERS);
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Resolve params
  useEffect(() => {
    params.then((p) => setTenant(p.tenant));
  }, [params]);

  const currentPage = parseInt(searchParams.get('page') || '1', 10);

  // -------------------------------------------------------------------------
  // Fetch agents for filter dropdown
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!tenant) return;

    fetch(`/api/ai/agents?tenantId=${tenant}&status=active`, {
      headers: {
        'x-user-id': 'current-user',
        'x-tenant-id': tenant,
        'x-user-role': 'org_admin',
      },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.data) {
          setAgents(data.data.map((a: { id: string; name: string }) => ({ id: a.id, name: a.name })));
        }
      })
      .catch(() => {});
  }, [tenant]);

  // -------------------------------------------------------------------------
  // Fetch calls
  // -------------------------------------------------------------------------
  const fetchCalls = useCallback(async () => {
    if (!tenant) return;
    setIsLoading(true);
    setError(null);

    try {
      const sp = new URLSearchParams();
      sp.set('page', String(currentPage));
      sp.set('limit', '20');

      if (filters.search) sp.set('search', filters.search);
      if (filters.status) sp.set('status', filters.status);
      if (filters.outcome) sp.set('outcome', filters.outcome);
      if (filters.agentId) sp.set('agentId', filters.agentId);
      if (filters.dateFrom) sp.set('createdAfter', filters.dateFrom);
      if (filters.dateTo) sp.set('createdBefore', filters.dateTo);

      const res = await fetch(`/api/ai/calls?${sp.toString()}`, {
        headers: {
          'x-user-id': 'current-user',
          'x-tenant-id': tenant,
          'x-user-role': 'org_admin',
        },
      });

      const response = await res.json();

      if (!res.ok) {
        throw new Error(response.error || 'Failed to fetch calls');
      }

      setCalls(response.data || []);
      setMeta(response.meta);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [tenant, currentPage, filters]);

  useEffect(() => {
    if (tenant) {
      fetchCalls();
    }
  }, [tenant, fetchCalls]);

  // -------------------------------------------------------------------------
  // URL helpers
  // -------------------------------------------------------------------------
  const createQueryString = useCallback(
    (params: Record<string, string>) => {
      const sp = new URLSearchParams(searchParams.toString());
      Object.entries(params).forEach(([key, value]) => {
        if (value) {
          sp.set(key, value);
        } else {
          sp.delete(key);
        }
      });
      return sp.toString();
    },
    [searchParams]
  );

  const goToPage = (page: number) => {
    router.push(`${pathname}?${createQueryString({ page: String(page) })}`);
  };

  const hasActiveFilters =
    filters.search ||
    filters.status ||
    filters.outcome ||
    filters.agentId ||
    filters.dateFrom ||
    filters.dateTo;

  const clearFilters = () => {
    setFilters(DEFAULT_FILTERS);
    router.push(pathname);
  };

  // -------------------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------------------
  if (isLoading && calls.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="animate-pulse space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="h-8 w-48 rounded bg-muted" />
                <div className="h-4 w-32 rounded bg-muted mt-2" />
              </div>
            </div>
            <div className="h-10 w-full rounded bg-muted" />
            <div className="space-y-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-16 rounded-lg bg-muted" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Error state
  // -------------------------------------------------------------------------
  if (error && calls.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="rounded-full bg-destructive/10 p-4 mb-4">
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
            <h3 className="text-lg font-semibold mb-1">
              Failed to load call history
            </h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-md">
              {error}
            </p>
            <Button variant="outline" onClick={fetchCalls}>
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
      <Toaster />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Call History</h1>
            <p className="text-sm text-muted-foreground mt-1">
              View all AI-powered calls and their outcomes
              {meta && ` · ${meta.total} total`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className={cn(showFilters && 'bg-accent')}
            >
              <Filter className="h-4 w-4 mr-1" />
              Filters
              {hasActiveFilters && (
                <span className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
                  !
                </span>
              )}
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={fetchCalls}
              disabled={isLoading}
            >
              <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
            </Button>
          </div>
        </div>

        {/* Filter panel */}
        {showFilters && (
          <div className="mb-6 rounded-lg border bg-card p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Filters</h3>
              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={clearFilters}
                >
                  <X className="h-3 w-3 mr-1" />
                  Clear all
                </Button>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {/* Search */}
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">
                  Search by lead name
                </label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search lead name..."
                    value={filters.search}
                    onChange={(e) =>
                      setFilters((prev) => ({ ...prev, search: e.target.value }))
                    }
                    className="pl-8 h-9 text-sm"
                  />
                </div>
              </div>

              {/* Status */}
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">Status</label>
                <Select
                  value={filters.status}
                  onValueChange={(v) =>
                    setFilters((prev) => ({ ...prev, status: v }))
                  }
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All Statuses</SelectItem>
                    {Object.entries(STATUS_LABELS).map(([key, label]) => (
                      <SelectItem key={key} value={key}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Outcome */}
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">Outcome</label>
                <Select
                  value={filters.outcome}
                  onValueChange={(v) =>
                    setFilters((prev) => ({ ...prev, outcome: v }))
                  }
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="All outcomes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All Outcomes</SelectItem>
                    {Object.entries(OUTCOME_LABELS).map(([key, label]) => (
                      <SelectItem key={key} value={key}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Agent */}
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">Agent</label>
                <Select
                  value={filters.agentId}
                  onValueChange={(v) =>
                    setFilters((prev) => ({ ...prev, agentId: v }))
                  }
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="All agents" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All Agents</SelectItem>
                    {agents.map((agent) => (
                      <SelectItem key={agent.id} value={agent.id}>
                        {agent.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Date From */}
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">From</label>
                <Input
                  type="date"
                  value={filters.dateFrom}
                  onChange={(e) =>
                    setFilters((prev) => ({ ...prev, dateFrom: e.target.value }))
                  }
                  className="h-9 text-sm"
                />
              </div>

              {/* Date To */}
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">To</label>
                <Input
                  type="date"
                  value={filters.dateTo}
                  onChange={(e) =>
                    setFilters((prev) => ({ ...prev, dateTo: e.target.value }))
                  }
                  className="h-9 text-sm"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Button size="sm" onClick={fetchCalls} disabled={isLoading}>
                {isLoading ? (
                  <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Search className="h-4 w-4 mr-1" />
                )}
                Apply Filters
              </Button>
            </div>
          </div>
        )}

        {/* Active filter badges */}
        {hasActiveFilters && !showFilters && (
          <div className="flex flex-wrap gap-2 mb-4">
            {filters.search && (
              <Badge variant="secondary" className="text-xs gap-1">
                Search: {filters.search}
                <button onClick={() => setFilters((prev) => ({ ...prev, search: '' }))}>
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
            {filters.status && (
              <Badge variant="secondary" className="text-xs gap-1">
                Status: {STATUS_LABELS[filters.status] || filters.status}
                <button onClick={() => setFilters((prev) => ({ ...prev, status: '' }))}>
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
            {filters.outcome && (
              <Badge variant="secondary" className="text-xs gap-1">
                Outcome: {OUTCOME_LABELS[filters.outcome] || filters.outcome}
                <button onClick={() => setFilters((prev) => ({ ...prev, outcome: '' }))}>
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )}
            <button
              onClick={clearFilters}
              className="text-xs text-muted-foreground hover:text-foreground underline"
            >
              Clear all
            </button>
          </div>
        )}

        {/* Empty state */}
        {calls.length === 0 && !isLoading && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="rounded-full bg-muted p-4 mb-4">
              <Phone className="h-10 w-10 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-1">No calls found</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              {hasActiveFilters
                ? 'No calls match the current filters. Try adjusting your search criteria.'
                : 'No AI calls have been made yet. Create an agent and queue your first call.'}
            </p>
            {hasActiveFilters && (
              <Button variant="outline" className="mt-4" onClick={clearFilters}>
                Clear Filters
              </Button>
            )}
          </div>
        )}

        {/* Call list (table on desktop, cards on mobile) */}
        {calls.length > 0 && (
          <>
            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-3 font-medium text-muted-foreground">Lead</th>
                    <th className="pb-3 font-medium text-muted-foreground">Phone</th>
                    <th className="pb-3 font-medium text-muted-foreground">Agent</th>
                    <th className="pb-3 font-medium text-muted-foreground">Status</th>
                    <th className="pb-3 font-medium text-muted-foreground">Duration</th>
                    <th className="pb-3 font-medium text-muted-foreground">Outcome</th>
                    <th className="pb-3 font-medium text-muted-foreground">Date</th>
                    <th className="pb-3 font-medium text-muted-foreground" />
                  </tr>
                </thead>
                <tbody>
                  {isLoading
                    ? Array.from({ length: 5 }).map((_, i) => (
                        <tr key={i} className="border-b last:border-0">
                          {Array.from({ length: 7 }).map((_, j) => (
                            <td key={j} className="py-3 pr-4">
                              <div className="h-4 rounded bg-muted animate-pulse" />
                            </td>
                          ))}
                        </tr>
                      ))
                    : calls.map((call) => (
                        <tr
                          key={call.id}
                          className="border-b last:border-0 hover:bg-muted/50 cursor-pointer transition-colors"
                          onClick={() =>
                            router.push(`/${tenant}/ai/calls/${call.id}`)
                          }
                        >
                          <td className="py-3 pr-4 font-medium">
                            {call.lead_name || '—'}
                          </td>
                          <td className="py-3 pr-4 text-muted-foreground">
                            {call.phone || '—'}
                          </td>
                          <td className="py-3 pr-4">
                            {call.agent_name || '—'}
                          </td>
                          <td className="py-3 pr-4">
                            <span
                              className={cn(
                                'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                                STATUS_STYLES[call.status] || 'bg-gray-100 text-gray-800'
                              )}
                            >
                              {STATUS_LABELS[call.status] || call.status}
                            </span>
                          </td>
                          <td className="py-3 pr-4 text-muted-foreground">
                            {formatDuration(call.duration_seconds)}
                          </td>
                          <td className="py-3 pr-4">
                            {call.outcome ? (
                              <span
                                className={cn(
                                  'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                                  OUTCOME_STYLES[call.outcome] || 'bg-gray-100 text-gray-800'
                                )}
                              >
                                {OUTCOME_LABELS[call.outcome] || call.outcome}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="py-3 pr-4 text-xs text-muted-foreground whitespace-nowrap">
                            {formatDateTime(call.created_at)}
                          </td>
                          <td className="py-3">
                            <Button variant="ghost" size="sm" className="h-8">
                              View
                            </Button>
                          </td>
                        </tr>
                      ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="sm:hidden space-y-3">
              {isLoading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-24 rounded-lg border bg-muted animate-pulse"
                    />
                  ))
                : calls.map((call) => (
                    <div
                      key={call.id}
                      className="rounded-lg border bg-card p-4 space-y-2 cursor-pointer hover:bg-accent/50 transition-colors"
                      onClick={() =>
                        router.push(`/${tenant}/ai/calls/${call.id}`)
                      }
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">
                          {call.lead_name || 'Unknown Lead'}
                        </span>
                        <span
                          className={cn(
                            'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                            STATUS_STYLES[call.status] || 'bg-gray-100 text-gray-800'
                          )}
                        >
                          {STATUS_LABELS[call.status] || call.status}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{call.phone || '—'}</span>
                        <span>{formatDuration(call.duration_seconds)}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span>{call.agent_name || '—'}</span>
                        <span>{formatDateTime(call.created_at)}</span>
                      </div>
                      {call.outcome && (
                        <span
                          className={cn(
                            'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                            OUTCOME_STYLES[call.outcome] || 'bg-gray-100 text-gray-800'
                          )}
                        >
                          {OUTCOME_LABELS[call.outcome] || call.outcome}
                        </span>
                      )}
                    </div>
                  ))}
            </div>

            {/* Pagination */}
            {meta && meta.total_pages > 1 && (
              <div className="flex items-center justify-between pt-6">
                <p className="text-sm text-muted-foreground">
                  Showing {(currentPage - 1) * meta.limit + 1}–
                  {Math.min(currentPage * meta.limit, meta.total)} of{' '}
                  {meta.total}
                </p>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    disabled={currentPage <= 1}
                    onClick={() => goToPage(currentPage - 1)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  {Array.from(
                    { length: Math.min(5, meta.total_pages) },
                    (_, i) => {
                      const start = Math.max(
                        1,
                        Math.min(currentPage - 2, meta.total_pages - 4)
                      );
                      const pageNum = start + i;
                      if (pageNum > meta.total_pages) return null;
                      return (
                        <Button
                          key={pageNum}
                          variant={
                            pageNum === currentPage ? 'default' : 'outline'
                          }
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => goToPage(pageNum)}
                        >
                          {pageNum}
                        </Button>
                      );
                    }
                  )}
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    disabled={currentPage >= meta.total_pages}
                    onClick={() => goToPage(currentPage + 1)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
