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
  CalendarDays,
  PhoneIncoming,
  PhoneOutgoing,
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
import { Toaster } from '@/components/ui/toaster';
import { CallLogCard } from '@/components/communication/CallLogCard';
import { formatDateTime } from '@/lib/utils';
import type { CallRecord } from '@/types/communication';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

// ---------------------------------------------------------------------------
// Filter state
// ---------------------------------------------------------------------------

interface CallFilters {
  status: string;
  direction: string;
  dateFrom: string;
  dateTo: string;
  search: string;
}

const DEFAULT_FILTERS: CallFilters = {
  status: '',
  direction: '',
  dateFrom: '',
  dateTo: '',
  search: '',
};

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'queued', label: 'Queued' },
  { value: 'ringing', label: 'Ringing' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
  { value: 'no_answer', label: 'No Answer' },
  { value: 'busy', label: 'Busy' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'missed', label: 'Missed' },
];

const DIRECTION_OPTIONS = [
  { value: '', label: 'All Directions' },
  { value: 'inbound', label: 'Inbound' },
  { value: 'outbound', label: 'Outbound' },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CommunicationCallsPage({
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

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Resolve params
  useEffect(() => {
    params.then((p) => setTenant(p.tenant));
  }, [params]);

  const currentPage = parseInt(searchParams.get('page') || '1', 10);

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
      if (filters.direction) sp.set('direction', filters.direction);
      if (filters.dateFrom) sp.set('created_after', filters.dateFrom);
      if (filters.dateTo) sp.set('created_before', filters.dateTo);

      const res = await fetch(`/api/communication/calls?${sp.toString()}`, {
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
    filters.status || filters.direction || filters.dateFrom || filters.dateTo || filters.search;

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
            <h3 className="text-lg font-semibold mb-1">Failed to load call history</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-md">{error}</p>
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
              View all voice calls and their statuses
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

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {/* Search */}
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">Search</label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by phone..."
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
                    {STATUS_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Direction */}
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">Direction</label>
                <Select
                  value={filters.direction}
                  onValueChange={(v) =>
                    setFilters((prev) => ({ ...prev, direction: v }))
                  }
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="All directions" />
                  </SelectTrigger>
                  <SelectContent>
                    {DIRECTION_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
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
              <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
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
                Apply
              </Button>
            </div>
          </div>
        )}

        {/* Summary stats */}
        {!isLoading && meta && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <div className="rounded-lg border bg-card p-3">
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="text-xl font-bold">{meta.total}</p>
            </div>
            <div className="rounded-lg border bg-card p-3">
              <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                <PhoneIncoming className="h-3 w-3 text-green-600" />
                Inbound
              </div>
              <p className="text-xl font-bold">
                {calls.filter((c) => c.direction === 'inbound').length}
              </p>
            </div>
            <div className="rounded-lg border bg-card p-3">
              <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                <PhoneOutgoing className="h-3 w-3 text-blue-600" />
                Outbound
              </div>
              <p className="text-xl font-bold">
                {calls.filter((c) => c.direction === 'outbound').length}
              </p>
            </div>
            <div className="rounded-lg border bg-card p-3">
              <p className="text-xs text-muted-foreground">In Progress</p>
              <p className="text-xl font-bold">
                {calls.filter((c) => c.status === 'in_progress' || c.status === 'ringing').length}
              </p>
            </div>
          </div>
        )}

        {/* Calls list */}
        <div className="space-y-2">
          {isLoading && calls.length > 0 && (
            <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10 rounded-lg">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {!isLoading && calls.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="rounded-full bg-muted p-4 mb-3">
                <Phone className="h-6 w-6 text-muted-foreground" />
              </div>
              <h3 className="text-sm font-semibold mb-1">No calls found</h3>
              <p className="text-xs text-muted-foreground max-w-sm">
                {hasActiveFilters
                  ? 'Try adjusting your filters to see more results.'
                  : 'No calls have been made yet. Start by making your first call.'}
              </p>
            </div>
          ) : (
            <div className="relative">
              {calls.map((call) => (
                <div key={call.id} className="mb-2">
                  <CallLogCard
                    call={call}
                    onClick={() => router.push(`${pathname}/${call.id}`)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pagination */}
        {meta && meta.total_pages > 1 && (
          <div className="flex items-center justify-between pt-6">
            <p className="text-sm text-muted-foreground">
              Showing {(currentPage - 1) * meta.limit + 1}–
              {Math.min(currentPage * meta.limit, meta.total)} of {meta.total}
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
                      variant={pageNum === currentPage ? 'default' : 'outline'}
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
      </div>
    </div>
  );
}
