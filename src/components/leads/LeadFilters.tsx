'use client';

import { useCallback, useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import {
  Search,
  X,
  Calendar,
  SlidersHorizontal,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LEAD_STATUSES, LEAD_SOURCES } from '@/lib/constants';
import { cn } from '@/lib/utils';

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: LEAD_STATUSES.NEW, label: 'New' },
  { value: LEAD_STATUSES.CONTACTED, label: 'Contacted' },
  { value: LEAD_STATUSES.QUALIFIED, label: 'Qualified' },
  { value: LEAD_STATUSES.PROPOSAL, label: 'Proposal' },
  { value: LEAD_STATUSES.NEGOTIATION, label: 'Negotiation' },
  { value: LEAD_STATUSES.CLOSED_WON, label: 'Won' },
  { value: LEAD_STATUSES.CLOSED_LOST, label: 'Lost' },
  { value: LEAD_STATUSES.ARCHIVED, label: 'Archived' },
];

const SOURCE_OPTIONS = [
  { value: '', label: 'All Sources' },
  { value: LEAD_SOURCES.WEBSITE, label: 'Website' },
  { value: LEAD_SOURCES.REFERRAL, label: 'Referral' },
  { value: LEAD_SOURCES.WHATSAPP, label: 'WhatsApp' },
  { value: LEAD_SOURCES.FACEBOOK, label: 'Facebook' },
  { value: LEAD_SOURCES.INSTAGRAM, label: 'Instagram' },
  { value: LEAD_SOURCES.COLD_CALL, label: 'Cold Call' },
  { value: LEAD_SOURCES.WALK_IN, label: 'Walk-In' },
  { value: LEAD_SOURCES.OTHER, label: 'Other' },
];

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest First' },
  { value: 'oldest', label: 'Oldest First' },
  { value: 'score_desc', label: 'Highest Score' },
  { value: 'score_asc', label: 'Lowest Score' },
  { value: 'status', label: 'Status' },
];

interface LeadFiltersProps {
  onSearch?: (query: string) => void;
  className?: string;
}

export function LeadFilters({ onSearch, className }: LeadFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [searchInput, setSearchInput] = useState(
    searchParams.get('search') || ''
  );
  const [showAdvanced, setShowAdvanced] = useState(false);

  const currentStatus = searchParams.get('status') || '';
  const currentSource = searchParams.get('source') || '';
  const currentSort = (() => {
    const sortBy = searchParams.get('sort_by');
    const sortDir = searchParams.get('sort_dir');
    if (sortBy === 'created_at' && sortDir !== 'asc') return 'newest';
    if (sortBy === 'created_at' && sortDir === 'asc') return 'oldest';
    if (sortBy === 'ai_score' && sortDir === 'desc') return 'score_desc';
    if (sortBy === 'ai_score' && sortDir === 'asc') return 'score_asc';
    if (sortBy === 'status') return 'status';
    return 'newest';
  })();

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
      // Reset to page 1 when filters change
      sp.delete('page');
      return sp.toString();
    },
    [searchParams]
  );

  const updateFilter = useCallback(
    (key: string, value: string) => {
      router.push(`${pathname}?${createQueryString({ [key]: value })}`);
    },
    [router, pathname, createQueryString]
  );

  const handleSearch = useCallback(
    (value: string) => {
      setSearchInput(value);
      onSearch?.(value);
      router.push(`${pathname}?${createQueryString({ search: value })}`);
    },
    [router, pathname, createQueryString, onSearch]
  );

  const clearAll = useCallback(() => {
    setSearchInput('');
    router.push(pathname);
  }, [router, pathname]);

  const hasActiveFilters =
    currentStatus || currentSource || currentSort !== 'newest' || searchInput;

  return (
    <div className={cn('space-y-3', className)}>
      {/* Search + Quick Filters Row */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, phone, email..."
            value={searchInput}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-9 pr-8"
          />
          {searchInput && (
            <button
              onClick={() => handleSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Status Dropdown */}
        <Select
          value={currentStatus}
          onValueChange={(v) => updateFilter('status', v)}
        >
          <SelectTrigger className="w-full sm:w-[140px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Source Dropdown */}
        <Select
          value={currentSource}
          onValueChange={(v) => updateFilter('source', v)}
        >
          <SelectTrigger className="w-full sm:w-[140px]">
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            {SOURCE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Sort Dropdown */}
        <Select
          value={currentSort}
          onValueChange={(v) => {
            switch (v) {
              case 'newest':
                updateFilter('sort_by', '');
                break;
              case 'oldest':
                router.push(
                  `${pathname}?${createQueryString({ sort_by: 'created_at', sort_dir: 'asc' })}`
                );
                break;
              case 'score_desc':
                router.push(
                  `${pathname}?${createQueryString({ sort_by: 'ai_score', sort_dir: 'desc' })}`
                );
                break;
              case 'score_asc':
                router.push(
                  `${pathname}?${createQueryString({ sort_by: 'ai_score', sort_dir: 'asc' })}`
                );
                break;
              case 'status':
                router.push(
                  `${pathname}?${createQueryString({ sort_by: 'status', sort_dir: 'asc' })}`
                );
                break;
            }
          }}
        >
          <SelectTrigger className="w-full sm:w-[150px]">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Toggle Advanced Filters */}
        <Button
          variant="outline"
          size="icon"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className={cn(showAdvanced && 'bg-muted')}
        >
          <SlidersHorizontal className="h-4 w-4" />
        </Button>

        {/* Clear All */}
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearAll}>
            <X className="h-4 w-4 mr-1" />
            Clear
          </Button>
        )}
      </div>

      {/* Advanced Filters */}
      {showAdvanced && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-4 rounded-lg border bg-muted/30">
          {/* Date Range */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              From Date
            </label>
            <Input
              type="date"
              value={searchParams.get('created_after') || ''}
              onChange={(e) =>
                router.push(
                  `${pathname}?${createQueryString({ created_after: e.target.value })}`
                )
              }
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              To Date
            </label>
            <Input
              type="date"
              value={searchParams.get('created_before') || ''}
              onChange={(e) =>
                router.push(
                  `${pathname}?${createQueryString({ created_before: e.target.value })}`
                )
              }
            />
          </div>

          {/* Score Range */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Min AI Score
            </label>
            <Input
              type="number"
              min={0}
              max={100}
              placeholder="0-100"
              value={searchParams.get('ai_score_min') || ''}
              onChange={(e) =>
                router.push(
                  `${pathname}?${createQueryString({ ai_score_min: e.target.value })}`
                )
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}
