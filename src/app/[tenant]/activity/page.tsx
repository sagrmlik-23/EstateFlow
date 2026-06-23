'use client';

import React, { useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Calendar, Filter, RotateCcw } from 'lucide-react';
import ActivityTimeline from '@/components/activity/ActivityTimeline';


// ---------------------------------------------------------------------------
// Activity type options
// ---------------------------------------------------------------------------
const ACTIVITY_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'All Types' },
  { value: 'lead_created', label: 'Lead Created' },
  { value: 'lead_updated', label: 'Lead Updated' },
  { value: 'lead_assigned', label: 'Lead Assigned' },
  { value: 'lead_status_changed', label: 'Status Changed' },
  { value: 'call_scheduled', label: 'Call Scheduled' },
  { value: 'call_completed', label: 'Call Completed' },
  { value: 'call_missed', label: 'Call Missed' },
  { value: 'message_sent', label: 'Message Sent' },
  { value: 'deal_closed', label: 'Deal Closed' },
  { value: 'deal_lost', label: 'Deal Lost' },
  { value: 'note_added', label: 'Note Added' },
  { value: 'task_completed', label: 'Task Completed' },
  { value: 'property_added', label: 'Property Added' },
  { value: 'property_updated', label: 'Property Updated' },
  { value: 'property_sold', label: 'Property Sold' },
];

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------
export default function ActivityFeedPage() {
  const params = useParams<{ tenant: string }>();
  const tenant = params?.tenant ?? '';

  // Filter state (local only — the ActivityTimeline itself doesn't filter types yet,
  // so we manage the filter UI here and could extend the timeline to accept filters)
  const [typeFilter, setTypeFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [resetKey, setResetKey] = useState(0);

  const clearFilters = useCallback(() => {
    setTypeFilter('');
    setDateFrom('');
    setDateTo('');
    setResetKey((k) => k + 1);
  }, []);

  const hasFilters = typeFilter || dateFrom || dateTo;

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Activity Feed</h1>
        <p className="text-sm text-muted-foreground">
          View all recent activity across your CRM
        </p>
      </div>

      {/* Filters */}
      <div className="mb-6 space-y-3 rounded-lg border bg-card p-4">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Filter className="h-4 w-4" />
          Filters
        </div>

        <div className="flex flex-wrap gap-3">
          {/* Activity Type */}
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              {ACTIVITY_TYPE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Date From */}
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full sm:w-[160px]"
              placeholder="From"
            />
          </div>

          {/* Date To */}
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full sm:w-[160px]"
              placeholder="To"
            />
          </div>

          {/* Clear */}
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1">
              <RotateCcw className="h-4 w-4" />
              Reset
            </Button>
          )}
        </div>
      </div>

      {/* Timeline */}
      <div className="rounded-lg border bg-card p-6">
        <ActivityTimeline
          key={resetKey}
          tenantId={tenant}
          pageSize={20}
        />
      </div>
    </div>
  );
}
