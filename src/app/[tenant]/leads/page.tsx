'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import {
  Plus,
  LayoutList,
  LayoutGrid,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Toaster } from '@/components/ui/toaster';
import { LeadTable } from '@/components/leads/LeadTable';
import { LeadFilters } from '@/components/leads/LeadFilters';
import { LeadCard } from '@/components/leads/LeadCard';
import { LeadForm } from '@/components/leads/LeadForm';
import { BulkActions } from '@/components/leads/BulkActions';
import type { LeadRow } from '@/lib/leads/queries';
import type { ApiResponse, PaginationMeta } from '@/lib/types';

type ViewMode = 'table' | 'card';

const STATUS_TABS = [
  { value: '', label: 'All' },
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'proposal', label: 'Proposal' },
  { value: 'negotiation', label: 'Negotiation' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
];

export default function LeadsPage({ params }: { params: Promise<{ tenant: string }> }) {
  const [tenant, setTenant] = useState<string>('');
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Resolve params
  useEffect(() => {
    params.then((p) => setTenant(p.tenant));
  }, [params]);

  // Current page from URL
  const currentPage = parseInt(searchParams.get('page') || '1', 10);

  // Fetch leads
  const fetchLeads = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const sp = new URLSearchParams(searchParams.toString());
      if (!sp.has('page')) sp.set('page', '1');
      if (!sp.has('limit')) sp.set('limit', '20');

      const res = await fetch(`/api/leads?${sp.toString()}`, {
        headers: {
          'x-user-id': 'current-user',
          'x-tenant-id': tenant,
          'x-user-role': 'agent',
        },
      });

      const response: ApiResponse<LeadRow[]> = await res.json();

      if (!res.ok) {
        throw new Error(response.error || 'Failed to fetch leads');
      }

      setLeads(response.data || []);
      setMeta(response.meta);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [searchParams, tenant]);

  useEffect(() => {
    if (tenant) {
      fetchLeads();
    }
  }, [tenant, fetchLeads]);

  // Create query string helper
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

  // Page change
  const goToPage = (page: number) => {
    router.push(`${pathname}?${createQueryString({ page: String(page) })}`);
  };

  // Status tab change
  const handleStatusChange = (value: string) => {
    router.push(`${pathname}?${createQueryString({ status: value, page: '1' })}`);
  };

  // Selection
  const handleSelectionChange = (ids: string[]) => {
    setSelectedIds(ids);
  };

  const clearSelection = () => setSelectedIds([]);

  // Refresh
  const handleRefresh = () => {
    fetchLeads();
  };

  // Lead created
  const handleLeadCreated = () => {
    setShowCreateDialog(false);
    fetchLeads();
  };

  const currentStatus = searchParams.get('status') || '';

  return (
    <div className="min-h-screen bg-background">
      <Toaster />

      {/* Page Header */}
      <div className="border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Leads</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Manage and track your leads
                {meta && ` · ${meta.total} total`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={handleRefresh}
                disabled={isLoading}
              >
                <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
              </Button>

              {/* View Toggle */}
              <div className="flex items-center border rounded-md">
                <Button
                  variant={viewMode === 'table' ? 'secondary' : 'ghost'}
                  size="icon"
                  className="h-9 w-9 rounded-none rounded-l-md"
                  onClick={() => setViewMode('table')}
                >
                  <LayoutList className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === 'card' ? 'secondary' : 'ghost'}
                  size="icon"
                  className="h-9 w-9 rounded-none rounded-r-md"
                  onClick={() => setViewMode('card')}
                >
                  <LayoutGrid className="h-4 w-4" />
                </Button>
              </div>

              {/* Create Lead Dialog */}
              <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-1" />
                    Add Lead
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Create New Lead</DialogTitle>
                  </DialogHeader>
                  <LeadForm
                    tenantId={tenant}
                    onSuccess={handleLeadCreated}
                    onCancel={() => setShowCreateDialog(false)}
                  />
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {/* Status Tabs */}
          <Tabs value={currentStatus} onValueChange={handleStatusChange}>
            <TabsList className="w-full justify-start overflow-x-auto">
              {STATUS_TABS.map((tab) => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="text-xs sm:text-sm"
                >
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-4">
        {/* Filters */}
        <LeadFilters />

        {/* Bulk Actions */}
        <BulkActions
          selectedIds={selectedIds}
          onClear={clearSelection}
          onComplete={fetchLeads}
        />

        {/* Error State */}
        {error && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="rounded-full bg-destructive/10 p-4 mb-4">
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
            <h3 className="text-lg font-semibold mb-1">Failed to load leads</h3>
            <p className="text-sm text-muted-foreground mb-4">{error}</p>
            <Button variant="outline" onClick={fetchLeads}>
              <RefreshCw className="h-4 w-4 mr-1" />
              Try Again
            </Button>
          </div>
        )}

        {/* Leads Content */}
        {!error && (
          <>
            {viewMode === 'table' ? (
              <LeadTable
                data={leads}
                selectedIds={selectedIds}
                onSelectionChange={handleSelectionChange}
                isLoading={isLoading}
              />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {isLoading
                  ? Array.from({ length: 6 }).map((_, i) => (
                      <div
                        key={i}
                        className="h-48 rounded-lg border bg-muted animate-pulse"
                      />
                    ))
                  : leads.map((lead) => (
                      <LeadCard
                        key={lead.id}
                        lead={lead}
                        isSelected={selectedIds.includes(lead.id)}
                        onSelect={(id, selected) => {
                          if (selected) {
                            setSelectedIds((prev) => [...prev, id]);
                          } else {
                            setSelectedIds((prev) => prev.filter((s) => s !== id));
                          }
                        }}
                      />
                    ))}
              </div>
            )}

            {/* Pagination */}
            {meta && meta.total_pages > 1 && (
              <div className="flex items-center justify-between pt-4">
                <p className="text-sm text-muted-foreground">
                  Showing {(currentPage - 1) * meta.limit + 1}–{Math.min(currentPage * meta.limit, meta.total)} of{' '}
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
                        Math.min(
                          currentPage - 2,
                          meta.total_pages - 4
                        )
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

function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}
