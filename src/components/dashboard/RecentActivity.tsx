'use client';

import { useState, useCallback } from 'react';
import {
  UserPlus,
  Phone,
  Trophy,
  Home,
  Mail,
  XCircle,
  CheckCircle2,
  CalendarClock,
  MessageSquare,
  FileText,
  RefreshCw,
  ChevronDown,
  Clock,
} from 'lucide-react';
import { cn, formatDateTime } from '@/lib/utils';
import type { ActivityEntry, ActivityType } from '@/lib/dashboard/queries';

// ─── Types ────────────────────────────────────────────────────────────────

interface RecentActivityProps {
  initialActivities: ActivityEntry[];
  tenantId: string;
}

// ─── Activity Icon Map ────────────────────────────────────────────────────

const activityIcons: Record<string, React.ReactNode> = {
  lead_created: <UserPlus className="h-4 w-4 text-blue-600" />,
  lead_updated: <FileText className="h-4 w-4 text-indigo-600" />,
  lead_assigned: <UserPlus className="h-4 w-4 text-cyan-600" />,
  lead_status_changed: <RefreshCw className="h-4 w-4 text-amber-600" />,
  call_scheduled: <CalendarClock className="h-4 w-4 text-violet-600" />,
  call_completed: <Phone className="h-4 w-4 text-emerald-600" />,
  call_missed: <XCircle className="h-4 w-4 text-red-600" />,
  message_sent: <MessageSquare className="h-4 w-4 text-sky-600" />,
  deal_closed: <Trophy className="h-4 w-4 text-emerald-600" />,
  deal_lost: <XCircle className="h-4 w-4 text-red-600" />,
  note_added: <FileText className="h-4 w-4 text-gray-600" />,
  task_completed: <CheckCircle2 className="h-4 w-4 text-emerald-600" />,
  property_added: <Home className="h-4 w-4 text-orange-600" />,
  property_updated: <Home className="h-4 w-4 text-amber-600" />,
  property_sold: <Trophy className="h-4 w-4 text-emerald-600" />,
  agent_login: <Mail className="h-4 w-4 text-purple-600" />,
  webhook_received: <RefreshCw className="h-4 w-4 text-gray-600" />,
};

const activityIconBg: Record<string, string> = {
  lead_created: 'bg-blue-100',
  lead_updated: 'bg-indigo-100',
  lead_assigned: 'bg-cyan-100',
  lead_status_changed: 'bg-amber-100',
  call_scheduled: 'bg-violet-100',
  call_completed: 'bg-emerald-100',
  call_missed: 'bg-red-100',
  message_sent: 'bg-sky-100',
  deal_closed: 'bg-emerald-100',
  deal_lost: 'bg-red-100',
  note_added: 'bg-gray-100',
  task_completed: 'bg-emerald-100',
  property_added: 'bg-orange-100',
  property_updated: 'bg-amber-100',
  property_sold: 'bg-emerald-100',
  agent_login: 'bg-purple-100',
  webhook_received: 'bg-gray-100',
};

function getActivityIcon(type: ActivityType): React.ReactNode {
  return activityIcons[type] ?? <Clock className="h-4 w-4 text-gray-600" />;
}

function getActivityIconBg(type: ActivityType): string {
  return activityIconBg[type] ?? 'bg-gray-100';
}

function getTimeAgo(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diffMs = now - date;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return formatDateTime(dateStr);
}

// ─── Activity Item ────────────────────────────────────────────────────────

function ActivityItem({ entry }: { entry: ActivityEntry }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-accent/50 group">
      {/* Icon */}
      <div className={cn('rounded-full p-1.5 flex-shrink-0 mt-0.5', getActivityIconBg(entry.type))}>
        {getActivityIcon(entry.type)}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm leading-snug">
          {entry.userName && (
            <span className="font-medium">{entry.userName}</span>
          )}
          {entry.description}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
          <Clock className="h-3 w-3 inline" />
          {getTimeAgo(entry.createdAt)}
        </p>
      </div>
    </div>
  );
}

// ─── Activity Feed Skeleton ───────────────────────────────────────────────

function ActivityFeedSkeleton() {
  return (
    <div className="divide-y animate-pulse">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-start gap-3 px-4 py-3">
          <div className="h-8 w-8 rounded-full bg-muted flex-shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-4 w-3/4 rounded bg-muted" />
            <div className="h-3 w-1/4 rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── RecentActivity Component ─────────────────────────────────────────────

export function RecentActivity({ initialActivities, tenantId: _ }: RecentActivityProps) {
  const [activities, setActivities] = useState<ActivityEntry[]>(initialActivities);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(initialActivities.length >= 10);

  const loadMore = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(
        `/api/dashboard/recent-activity?limit=10&offset=${activities.length}`,
      );
      if (!res.ok) throw new Error('Failed to load more');
      const json = await res.json();
      if (json.success && json.data) {
        if (json.data.length === 0) {
          setHasMore(false);
        } else {
          setActivities((prev) => [...prev, ...json.data]);
        }
      }
    } catch (error) {
      console.error('[RecentActivity] loadMore error:', error);
    } finally {
      setIsLoading(false);
    }
  }, [activities.length]);

  // Empty state
  if (activities.length === 0 && !isLoading) {
    return (
      <div className="rounded-xl border bg-card shadow-sm">
        <div className="px-4 py-3 border-b">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-primary" />
            Recent Activity
          </h3>
        </div>
        <div className="flex flex-col items-center justify-center py-10 text-center px-4">
          <Clock className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-sm font-medium text-muted-foreground">No activity yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Activity from leads, calls, and deals will appear here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card shadow-sm">
      {/* Header */}
      <div className="px-4 py-3 border-b flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <RefreshCw className="h-4 w-4 text-primary" />
          Recent Activity
        </h3>
        <span className="text-xs text-muted-foreground">
          {activities.length} events
        </span>
      </div>

      {/* Activity list */}
      <div className="divide-y max-h-[400px] overflow-y-auto">
        {isLoading && activities.length === 0 ? (
          <ActivityFeedSkeleton />
        ) : (
          <>
            {activities.map((entry) => (
              <ActivityItem key={entry.id} entry={entry} />
            ))}
          </>
        )}
      </div>

      {/* Load more */}
      {hasMore && (
        <div className="border-t px-4 py-2.5">
          <button
            onClick={loadMore}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors py-1"
          >
            {isLoading ? (
              <>
                <RefreshCw className="h-3 w-3 animate-spin" />
                Loading...
              </>
            ) : (
              <>
                <ChevronDown className="h-3.5 w-3.5" />
                Load more
              </>
            )}
          </button>
        </div>
      )}

      {/* Error state */}
      {!hasMore && activities.length > 0 && activities.length < 10 && (
        <div className="border-t px-4 py-2.5 text-center text-xs text-muted-foreground">
          All activity loaded
        </div>
      )}
    </div>
  );
}
