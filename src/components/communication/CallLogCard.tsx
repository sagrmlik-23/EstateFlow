'use client';

import { Phone, PhoneIncoming, PhoneOutgoing, Clock, User, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { formatDateTime } from '@/lib/utils';
import type { CallRecord } from '@/types/communication';

// ---------------------------------------------------------------------------
// Call status display helpers
// ---------------------------------------------------------------------------

export const CALL_STATUS_STYLES: Record<string, string> = {
  queued: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  ringing: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  in_progress: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  completed: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  no_answer: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
  busy: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  cancelled: 'bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-400',
  missed: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400',
};

export const CALL_STATUS_LABELS: Record<string, string> = {
  queued: 'Queued',
  ringing: 'Ringing',
  in_progress: 'In Progress',
  completed: 'Completed',
  failed: 'Failed',
  no_answer: 'No Answer',
  busy: 'Busy',
  cancelled: 'Cancelled',
  missed: 'Missed',
};

function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CallLogCardProps {
  call: CallRecord;
  onClick?: () => void;
  compact?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CallLogCard({ call, onClick, compact = false }: CallLogCardProps) {
  const DirectionIcon = call.direction === 'inbound' ? PhoneIncoming : PhoneOutgoing;
  const directionLabel = call.direction === 'inbound' ? 'Inbound' : 'Outbound';

  if (compact) {
    return (
      <button
        onClick={onClick}
        className="w-full text-left rounded-lg border bg-card hover:bg-accent/50 transition-colors p-3"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={cn(
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                call.direction === 'inbound'
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
              )}
            >
              <DirectionIcon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">
                {call.calleePhone || call.callerPhone || 'Unknown'}
              </p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>{formatDuration(call.durationSeconds)}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-muted-foreground">{formatDateTime(call.createdAt)}</span>
            <span
              className={cn(
                'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                CALL_STATUS_STYLES[call.status] || 'bg-gray-100 text-gray-800'
              )}
            >
              {CALL_STATUS_LABELS[call.status] || call.status}
            </span>
          </div>
        </div>
      </button>
    );
  }

  return (
    <Card
      className={cn(
        'cursor-pointer transition-colors hover:bg-accent/50',
        onClick && 'cursor-pointer'
      )}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div
              className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
                call.direction === 'inbound'
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
              )}
            >
              <DirectionIcon className="h-5 w-5" />
            </div>
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold truncate">
                  {call.direction === 'inbound' ? call.callerPhone || 'Unknown' : call.calleePhone || 'Unknown'}
                </p>
                <Badge variant="outline" className="text-[10px] h-5">
                  {directionLabel}
                </Badge>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatDuration(call.durationSeconds)}
                </span>
                <span>{formatDateTime(call.createdAt)}</span>
                {call.leadId && (
                  <span className="flex items-center gap-1">
                    <User className="h-3 w-3" />
                    Lead
                  </span>
                )}
              </div>
              {call.notes && (
                <p className="text-xs text-muted-foreground line-clamp-1">{call.notes}</p>
              )}
            </div>
          </div>
          <span
            className={cn(
              'shrink-0 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
              CALL_STATUS_STYLES[call.status] || 'bg-gray-100 text-gray-800'
            )}
          >
            {CALL_STATUS_LABELS[call.status] || call.status}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Call status badge (standalone)
// ---------------------------------------------------------------------------

export function CallStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        CALL_STATUS_STYLES[status] || 'bg-gray-100 text-gray-800'
      )}
    >
      {CALL_STATUS_LABELS[status] || status}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Direction icon
// ---------------------------------------------------------------------------

export function CallDirectionIcon({ direction }: { direction: 'inbound' | 'outbound' }) {
  return direction === 'inbound' ? (
    <PhoneIncoming className="h-4 w-4 text-green-600" />
  ) : (
    <PhoneOutgoing className="h-4 w-4 text-blue-600" />
  );
}
