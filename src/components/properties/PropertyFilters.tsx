'use client';

import React, { useCallback } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PROPERTY_TYPES, AVAILABILITY_STATUSES } from '@/lib/constants';
import { getPropertyTypeLabel } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const BEDROOM_OPTIONS = [
  { value: '', label: 'Any Bedrooms' },
  { value: '1', label: '1+ BHK' },
  { value: '2', label: '2+ BHK' },
  { value: '3', label: '3+ BHK' },
  { value: '4', label: '4+ BHK' },
  { value: '5', label: '5+ BHK' },
];

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  ...Object.entries(AVAILABILITY_STATUSES).map(([key, val]) => ({
    value: val,
    label: key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
  })),
];

const TYPE_OPTIONS = [
  { value: '', label: 'All Types' },
  ...Object.entries(PROPERTY_TYPES).map(([key, val]) => ({
    value: val,
    label: getPropertyTypeLabel(val),
  })),
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
export interface PropertyFiltersProps {
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function PropertyFilters({ className }: PropertyFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Read current values from URL
  const currentSearch = searchParams.get('search') ?? '';
  const currentType = searchParams.get('property_type') ?? '';
  const currentStatus = searchParams.get('availability_status') ?? '';
  const currentPriceMin = searchParams.get('price_min') ?? '';
  const currentPriceMax = searchParams.get('price_max') ?? '';
  const currentBedrooms = searchParams.get('bedrooms') ?? '';
  const currentLocation = searchParams.get('location') ?? '';

  // Build new URL
  const updateSearchParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      // Reset to page 1 when filters change
      params.delete('page');
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams],
  );

  const clearAllFilters = useCallback(() => {
    router.push(pathname);
  }, [router, pathname]);

  const hasAnyFilter =
    currentSearch ||
    currentType ||
    currentStatus ||
    currentPriceMin ||
    currentPriceMax ||
    currentBedrooms ||
    currentLocation;

  return (
    <div className={cn('space-y-3', className as string)}>
      {/* Search + Clear */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search properties..."
            value={currentSearch}
            onChange={(e) => updateSearchParam('search', e.target.value)}
            className="pl-9"
          />
        </div>

        {hasAnyFilter && (
          <Button variant="ghost" size="sm" onClick={clearAllFilters} className="shrink-0 gap-1">
            <X className="h-4 w-4" />
            Clear
          </Button>
        )}
      </div>

      {/* Filter row */}
      <div className="flex flex-wrap gap-3">
        {/* Property Type */}
        <Select
          value={currentType}
          onValueChange={(v) => updateSearchParam('property_type', v)}
        >
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            {TYPE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Status */}
        <Select
          value={currentStatus}
          onValueChange={(v) => updateSearchParam('availability_status', v)}
        >
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Bedrooms */}
        <Select
          value={currentBedrooms}
          onValueChange={(v) => updateSearchParam('bedrooms', v)}
        >
          <SelectTrigger className="w-full sm:w-[150px]">
            <SelectValue placeholder="Any Bedrooms" />
          </SelectTrigger>
          <SelectContent>
            {BEDROOM_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Price range */}
        <div className="flex items-center gap-2">
          <Input
            type="number"
            placeholder="Min price"
            value={currentPriceMin}
            onChange={(e) => updateSearchParam('price_min', e.target.value)}
            className="w-full sm:w-[120px]"
            min={0}
          />
          <span className="text-muted-foreground">—</span>
          <Input
            type="number"
            placeholder="Max price"
            value={currentPriceMax}
            onChange={(e) => updateSearchParam('price_max', e.target.value)}
            className="w-full sm:w-[120px]"
            min={0}
          />
        </div>

        {/* Location */}
        <Input
          placeholder="Location..."
          value={currentLocation}
          onChange={(e) => updateSearchParam('location', e.target.value)}
          className="w-full sm:w-[180px]"
        />
      </div>
    </div>
  );
}

// Need to use cn but it's imported above
import { cn } from '@/lib/utils';
