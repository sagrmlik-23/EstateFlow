'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import {
  MessageSquare,
  Search,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  AlertCircle,
  Filter,
  X,
  Inbox,
  Send,
  Mail,
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Toaster } from '@/components/ui/toaster';
import { formatDateTime, timeAgo } from '@/lib/utils';
import type { MessageRecord, MessageChannel, MessageStatus } from '@/types/communication';

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
// Channel config
// ---------------------------------------------------------------------------

const CHANNEL_CONFIG: Record<MessageChannel, { label: string; icon: string; color: string }> = {
  whatsapp: { label: 'WhatsApp', icon: '💬', color: 'text-green-600' },
  sms: { label: 'SMS', icon: '📱', color: 'text-blue-600' },
  email: { label: 'Email', icon: '📧', color: 'text-purple-600' },
  in_app: { label: 'In-App', icon: '🔔', color: 'text-orange-600' },
  web: { label: 'Web', icon: '🌐', color: 'text-cyan-600' },
};

const CHANNEL_TABS = [
  { value: '', label: 'All' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'sms', label: 'SMS' },
  { value: 'email', label: 'Email' },
];

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'queued', label: 'Queued' },
  { value: 'sent', label: 'Sent' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'read', label: 'Read' },
  { value: 'failed', label: 'Failed' },
];

const DIRECTION_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'outbound', label: 'Outbound' },
  { value: 'inbound', label: 'Inbound' },
];

const STATUS_STYLES: Record<string, string> = {
  queued: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  sent: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
  delivered: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  read: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};

// ---------------------------------------------------------------------------
// Filter state
// ---------------------------------------------------------------------------

interface MessageFilters {
  channel: string;
  direction: string;
  status: string;
  search: string;
  dateFrom: string;
  dateTo: string;
}

const DEFAULT_FILTERS: MessageFilters = {
  channel: '',
  direction: '',
  status: '',
  search: '',
  dateFrom: '',
  dateTo: '',
};

// ---------------------------------------------------------------------------
// Message List Item
// ---------------------------------------------------------------------------

function MessageListItem({
  message,
  onClick,
}: {
  message: MessageRecord;
  onClick?: () => void;
}) {
  const channelCfg = CHANNEL_CONFIG[message.channel] || CHANNEL_CONFIG.whatsapp;

  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-lg border bg-card hover:bg-accent/50 transition-colors p-3"
    >
      <div className="flex items-start gap-3">
        {/* Channel icon */}
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-base">
          {channelCfg.icon}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">
                {message.channel === 'email'
                  ? 'Email Message'
                  : `Message via ${channelCfg.label}`}
              </p>
              <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                {message.content || '(No content)'}
              </p>
            </div>
            <span className="text-xs text-muted-foreground shrink-0 whitespace-nowrap">
              {timeAgo(message.created_at)}
            </span>
          </div>

          {/* Footer */}
          <div className="flex items-center gap-2 mt-2">
            <span
              className={cn(
                'inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                STATUS_STYLES[message.status] || 'bg-gray-100 text-gray-800'
              )}
            >
              {message.status}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {message.direction === 'outbound' ? '→ Sent' : '← Received'}
            </span>
            {message.media_urls && message.media_urls.length > 0 && (
              <span className="text-[10px] text-muted-foreground">
                📎 {message.media_urls.length}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CommunicationMessagesPage({
  params,
}: {
  params: Promise<{ tenant: string }>;
}) {
  const [tenant, setTenant] = useState('');
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<MessageFilters>(DEFAULT_FILTERS);

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Resolve params
  useEffect(() => {
    params.then((p) => setTenant(p.tenant));
  }, [params]);

  const currentPage = parseInt(searchParams.get('page') || '1', 10);

  // Current channel tab from URL
  const currentChannel = searchParams.get('channel') || '';

  // -------------------------------------------------------------------------
  // Fetch messages
  // -------------------------------------------------------------------------
  const fetchMessages = useCallback(async () => {
    if (!tenant) return;
    setIsLoading(true);
    setError(null);

    try {
      const sp = new URLSearchParams();
      sp.set('page', String(currentPage));
      sp.set('limit', '20');

      // Channel from URL tab
      if (currentChannel) sp.set('channel', currentChannel);
      if (filters.direction) sp.set('direction', filters.direction);
      if (filters.status) sp.set('status', filters.status);
      if (filters.search) sp.set('search', filters.search);
      if (filters.dateFrom) sp.set('created_after', filters.dateFrom);
      if (filters.dateTo) sp.set('created_before', filters.dateTo);

      const res = await fetch(`/api/communication/messages?${sp.toString()}`, {
        headers: {
          'x-user-id': 'current-user',
          'x-tenant-id': tenant,
          'x-user-role': 'org_admin',
        },
      });

      const response = await res.json();

      if (!res.ok) {
        throw new Error(response.error || 'Failed to fetch messages');
      }

      setMessages(response.data || []);
      setMeta(response.meta);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [tenant, currentPage, currentChannel, filters]);

  useEffect(() => {
    if (tenant) {
      fetchMessages();
    }
  }, [tenant, fetchMessages]);

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

  const handleChannelChange = (value: string) => {
    router.push(`${pathname}?${createQueryString({ channel: value, page: '1' })}`);
  };

  const hasActiveFilters =
    filters.direction || filters.status || filters.search || filters.dateFrom || filters.dateTo;

  const clearFilters = () => {
    setFilters(DEFAULT_FILTERS);
    router.push(`${pathname}?${createQueryString({ channel: currentChannel })}`);
  };

  // -------------------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------------------
  if (isLoading && messages.length === 0) {
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
                <div key={i} className="h-20 rounded-lg bg-muted" />
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
  if (error && messages.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="rounded-full bg-destructive/10 p-4 mb-4">
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
            <h3 className="text-lg font-semibold mb-1">Failed to load messages</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-md">{error}</p>
            <Button variant="outline" onClick={fetchMessages}>
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

      <div className="border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Messages</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Inbox for WhatsApp, SMS, and Email messages
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
                onClick={fetchMessages}
                disabled={isLoading}
              >
                <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
              </Button>
            </div>
          </div>

          {/* Channel Tabs */}
          <Tabs value={currentChannel} onValueChange={handleChannelChange}>
            <TabsList className="w-full justify-start overflow-x-auto">
              {CHANNEL_TABS.map((tab) => (
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

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
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
                    placeholder="Search content..."
                    value={filters.search}
                    onChange={(e) =>
                      setFilters((prev) => ({ ...prev, search: e.target.value }))
                    }
                    className="pl-8 h-9 text-sm"
                  />
                </div>
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
                    <SelectValue placeholder="All" />
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
              <Button size="sm" onClick={fetchMessages} disabled={isLoading}>
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

        {/* Messages list */}
        <div className="space-y-2">
          {!isLoading && messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="rounded-full bg-muted p-4 mb-3">
                <Inbox className="h-6 w-6 text-muted-foreground" />
              </div>
              <h3 className="text-sm font-semibold mb-1">No messages found</h3>
              <p className="text-xs text-muted-foreground max-w-sm">
                {hasActiveFilters || currentChannel
                  ? 'Try adjusting your filters to see more results.'
                  : 'No messages have been sent or received yet.'}
              </p>
            </div>
          ) : (
            <div className="relative">
              {isLoading && messages.length > 0 && (
                <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10 rounded-lg">
                  <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              )}
              <div className="space-y-2">
                {messages.map((message) => (
                  <MessageListItem
                    key={message.id}
                    message={message}
                    onClick={() => {}}
                  />
                ))}
              </div>
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
