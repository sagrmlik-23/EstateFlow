'use client';

import { useMemo, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import type { TranscriptEntry } from '@/types/ai';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface CallTranscriptProps {
  entries: TranscriptEntry[];
  className?: string;
  sentimentTags?: Record<number, string>;
  compact?: boolean;
}

// ---------------------------------------------------------------------------
// Sentiment badge colors
// ---------------------------------------------------------------------------
function getSentimentBadgeVariant(
  sentiment: string
): 'default' | 'secondary' | 'destructive' | 'outline' {
  const s = sentiment.toLowerCase();
  if (s.includes('positive') || s.includes('interested') || s.includes('happy'))
    return 'default';
  if (s.includes('negative') || s.includes('angry') || s.includes('frustrated'))
    return 'destructive';
  if (s.includes('neutral') || s.includes('confused') || s.includes('question'))
    return 'secondary';
  return 'outline';
}

// ---------------------------------------------------------------------------
// Time formatting
// ---------------------------------------------------------------------------
function formatTimestamp(seconds?: number): string {
  if (seconds === undefined || seconds === null) return '';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function CallTranscript({
  entries,
  className,
  sentimentTags = {},
  compact = false,
}: CallTranscriptProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new entries
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries.length]);

  // Group consecutive same-role entries if compact
  const displayEntries = useMemo(() => {
    if (!compact) return entries;

    return entries.reduce<{ role: 'agent' | 'user'; text: string; timestamps: number[] }[]>(
      (acc, entry) => {
        const last = acc[acc.length - 1];
        if (last && last.role === entry.role) {
          last.text += '\n' + entry.text;
          if (entry.timestamp !== undefined) {
            last.timestamps.push(entry.timestamp);
          }
        } else {
          acc.push({
            role: entry.role,
            text: entry.text,
            timestamps: entry.timestamp !== undefined ? [entry.timestamp] : [],
          });
        }
        return acc;
      },
      []
    );
  }, [entries, compact]);

  if (entries.length === 0) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center py-12 text-center',
          className
        )}
      >
        <div className="rounded-full bg-muted p-3 mb-3">
          <svg
            className="h-6 w-6 text-muted-foreground"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
        </div>
        <p className="text-sm text-muted-foreground">No transcript available</p>
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      className={cn(
        'space-y-3 overflow-y-auto max-h-[500px] px-1',
        className
      )}
    >
      {(compact ? displayEntries : entries).map((entry, index) => {
        const isAgent = entry.role === 'agent';
        const sentiment = sentimentTags[index];
        const timestamp = 'timestamp' in entry ? (entry as any).timestamp : (entry as any).timestamps?.[0];
        const timestamps = 'timestamps' in entry ? (entry as any).timestamps : ((entry as any).timestamp !== undefined ? [(entry as any).timestamp] : []);
        const entryKey = (() => {
          const t = 'timestamp' in entry ? (entry as any).timestamp : (entry as any).timestamps?.[0];
          const txt = ((entry as any).text || '').slice(0, 20);
          return t != null ? `${entry.role}-${t}-${txt}` : `${entry.role}-${index}-${txt}`;
        })();

        return (
          <div
            key={entryKey}
            className={cn(
              'flex',
              isAgent ? 'justify-start' : 'justify-end'
            )}
          >
            <div
              className={cn(
                'max-w-[85%] rounded-lg px-3 py-2',
                isAgent
                  ? 'bg-primary/10 text-foreground rounded-tl-sm'
                  : 'bg-muted text-foreground rounded-tr-sm'
              )}
            >
              {/* Role label + timestamp */}
              <div className="flex items-center gap-2 mb-1">
                <span
                  className={cn(
                    'text-xs font-semibold',
                    isAgent ? 'text-primary' : 'text-muted-foreground'
                  )}
                >
                  {isAgent ? '🤖 Agent' : '👤 Lead'}
                </span>
                {timestamp !== undefined && (
                  <span className="text-[10px] text-muted-foreground">
                    {formatTimestamp(timestamp)}
                  </span>
                )}
                {timestamps.length > 0 && !timestamp && (
                  <span className="text-[10px] text-muted-foreground">
                    {formatTimestamp(timestamps[0])}
                    {timestamps.length > 1 && ` — ${formatTimestamp(timestamps[timestamps.length - 1])}`}
                  </span>
                )}
              </div>

              {/* Text content */}
              <p className="text-sm whitespace-pre-wrap leading-relaxed">
                {entry.text}
              </p>

              {/* Sentiment tag */}
              {sentiment && (
                <div className="mt-1.5">
                  <Badge
                    variant={getSentimentBadgeVariant(sentiment)}
                    className="text-[10px] px-1.5 py-0"
                  >
                    {sentiment}
                  </Badge>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
