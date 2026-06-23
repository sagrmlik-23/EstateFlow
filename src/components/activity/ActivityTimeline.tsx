'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Phone,
  PhoneCall,
  PhoneMissed,
  MessageSquare,
  UserPlus,
  UserCheck,
  UserCog,
  ArrowRightCircle,
  Award,
  XCircle,
  FileText,
  CheckCircle,
  Home,
  Edit3,
  LogIn,
  Webhook,
  Circle,
  Loader2,
  Clock,
} from 'lucide-react';
import { cn, timeAgo, getActivityIconName } from '@/lib/utils';
import type { ActivityEntry } from '@/lib/dashboard/queries';
import { getActivityFeed } from '@/lib/activity/queries';

// ---------------------------------------------------------------------------
// Icon mapping
// ---------------------------------------------------------------------------
const ICON_MAP: Record<string, React.ReactNode> = {
  UserPlus: <UserPlus className="h-4 w-4" />,
  UserCheck: <UserCheck className="h-4 w-4" />,
  UserCog: <UserCog className="h-4 w-4" />,
  ArrowRightCircle: <ArrowRightCircle className="h-4 w-4" />,
  Phone: <Phone className="h-4 w-4" />,
  PhoneCall: <PhoneCall className="h-4 w-4" />,
  PhoneMissed: <PhoneMissed className="h-4 w-4" />,
  MessageSquare: <MessageSquare className="h-4 w-4" />,
  Award: <Award className="h-4 w-4" />,
  XCircle: <XCircle className="h-4 w-4" />,
  FileText: <FileText className="h-4 w-4" />,
  CheckCircle: <CheckCircle className="h-4 w-4" />,
  Home: <Home className="h-4 w-4" />,
  Edit3: <Edit3 className="h-4 w-4" />,
  LogIn: <LogIn className="h-4 w-4" />,
  Webhook: <Webhook className="h-4 w-4" />,
};

function ActivityIcon({ type }: { type: string }) {
  const iconName = getActivityIconName(type);
  const Icon = ICON_MAP[iconName] ?? <Circle className="h-4 w-4" />;

  // Per-type color
  const colorMap: Record<string, string> = {
    lead_created: 'text-blue-500 bg-blue-100 dark:bg-blue-900/30',
    lead_updated: 'text-indigo-500 bg-indigo-100 dark:bg-indigo-900/30',
    lead_assigned: 'text-purple-500 bg-purple-100 dark:bg-purple-900/30',
    lead_status_changed: 'text-orange-500 bg-orange-100 dark:bg-orange-900/30',
    call_scheduled: 'text-cyan-500 bg-cyan-100 dark:bg-cyan-900/30',
    call_completed: 'text-green-500 bg-green-100 dark:bg-green-900/30',
    call_missed: 'text-red-500 bg-red-100 dark:bg-red-900/30',
    message_sent: 'text-teal-500 bg-teal-100 dark:bg-teal-900/30',
    deal_closed: 'text-emerald-500 bg-emerald-100 dark:bg-emerald-900/30',
    deal_lost: 'text-rose-500 bg-rose-100 dark:bg-rose-900/30',
    note_added: 'text-amber-500 bg-amber-100 dark:bg-amber-900/30',
    task_completed: 'text-green-500 bg-green-100 dark:bg-green-900/30',
    property_added: 'text-sky-500 bg-sky-100 dark:bg-sky-900/30',
    property_updated: 'text-violet-500 bg-violet-100 dark:bg-violet-900/30',
    property_sold: 'text-green-500 bg-green-100 dark:bg-green-900/30',
    agent_login: 'text-slate-500 bg-slate-100 dark:bg-slate-900/30',
    webhook_received: 'text-gray-500 bg-gray-100 dark:bg-gray-900/30',
  };

  return (
    <div
      className={cn(
        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
        colorMap[type] ?? 'text-gray-500 bg-gray-100 dark:bg-gray-900/30',
      )}
    >
      {Icon}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
export interface ActivityTimelineProps {
  tenantId: string;
  entityType?: string;
  entityId?: string;
  /** Max items per page load */
  pageSize?: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function ActivityTimeline({
  tenantId,
  entityType,
  entityId,
  pageSize = 20,
}: ActivityTimelineProps) {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Fetch activity
  const fetchActivity = useCallback(
    async (pageNum: number, append: boolean) => {
      try {
        if (append) {
          setLoadingMore(true);
        } else {
          setLoading(true);
        }

        const result = await getActivityFeed(
          tenantId,
          {
            entityType,
            entityId,
          },
          { page: pageNum, limit: pageSize },
        );

        if (append) {
          setEntries((prev) => [...prev, ...result.entries]);
        } else {
          setEntries(result.entries);
        }

        setHasMore(pageNum < result.meta.total_pages);
        setPage(pageNum);
      } catch (error) {
        console.error('[ActivityTimeline] Failed to fetch:', error);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [tenantId, entityType, entityId, pageSize],
  );

  // Initial fetch
  useEffect(() => {
    fetchActivity(1, false);
  }, [fetchActivity]);

  // Infinite scroll
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry?.isIntersecting && hasMore && !loadingMore && !loading) {
          fetchActivity(page + 1, true);
        }
      },
      { rootMargin: '200px' },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, loading, page, fetchActivity]);

  // --- Loading state ---
  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex animate-pulse gap-3">
            <div className="h-8 w-8 rounded-full bg-muted" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-3/4 rounded bg-muted" />
              <div className="h-3 w-1/4 rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // --- Empty state ---
  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Clock className="h-12 w-12 text-muted-foreground/40" />
        <h3 className="mt-4 text-sm font-medium text-muted-foreground">No activity yet</h3>
        <p className="mt-1 text-xs text-muted-foreground/60">
          Activity entries will appear here as actions are performed.
        </p>
      </div>
    );
  }

  // --- Timeline item ---
  return (
    <div className="relative">
      {/* Vertical line */}
      <div className="absolute left-4 top-0 h-full w-px bg-border" />

      <div className="space-y-0">
        {entries.map((entry) => (
          <div key={entry.id} className="relative flex gap-4 pb-6 pl-10">
            {/* Icon (overlaps the line) */}
            <div className="absolute left-2.5 top-0 z-10">
              <ActivityIcon type={entry.type} />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <p className="text-sm text-foreground">{entry.description}</p>
              <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                <span>{timeAgo(entry.createdAt)}</span>
                {entry.userName && (
                  <>
                    <span>·</span>
                    <span>{entry.userName}</span>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} className="py-2">
        {loadingMore && (
          <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading more...
          </div>
        )}
        {!hasMore && entries.length > 0 && (
          <p className="py-4 text-center text-xs text-muted-foreground/60">
            All activity loaded
          </p>
        )}
      </div>
    </div>
  );
}
