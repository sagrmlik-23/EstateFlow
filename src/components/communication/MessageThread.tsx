'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  CheckCheck,
  Check,
  Clock,
  AlertTriangle,
  ChevronDown,
} from 'lucide-react';
import { cn, formatDateTime } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { MessageRecord, MessageChannel, MessageStatus } from '@/types/communication';

// ---------------------------------------------------------------------------
// Channel icons & labels
// ---------------------------------------------------------------------------

const CHANNEL_ICONS: Record<MessageChannel, string> = {
  whatsapp: '💬',
  sms: '📱',
  email: '📧',
  in_app: '🔔',
  web: '🌐',
};

const CHANNEL_LABELS: Record<MessageChannel, string> = {
  whatsapp: 'WhatsApp',
  sms: 'SMS',
  email: 'Email',
  in_app: 'In-App',
  web: 'Web',
};

// ---------------------------------------------------------------------------
// Status icon
// ---------------------------------------------------------------------------

function StatusIcon({ status }: { status: MessageStatus }) {
  switch (status) {
    case 'sent':
      return <Check className="h-3 w-3 text-muted-foreground" />;
    case 'delivered':
      return <CheckCheck className="h-3 w-3 text-blue-500" />;
    case 'read':
      return <CheckCheck className="h-3 w-3 text-emerald-500" />;
    case 'queued':
      return <Clock className="h-3 w-3 text-muted-foreground" />;
    case 'failed':
      return <AlertTriangle className="h-3 w-3 text-destructive" />;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Individual message bubble
// ---------------------------------------------------------------------------

function MessageBubble({
  message,
  isConsecutive,
}: {
  message: MessageRecord;
  isConsecutive: boolean;
}) {
  const isOutbound = message.direction === 'outbound';

  return (
    <div
      className={cn(
        'flex',
        isOutbound ? 'justify-end' : 'justify-start',
        !isConsecutive && 'mt-3'
      )}
    >
      <div
        className={cn(
          'max-w-[80%] sm:max-w-[70%] rounded-2xl px-3.5 py-2 text-sm',
          isOutbound
            ? 'bg-primary text-primary-foreground rounded-br-md'
            : 'bg-muted rounded-bl-md',
          isConsecutive &&
            (isOutbound ? 'rounded-tr-md' : 'rounded-tl-md')
        )}
      >
        {/* Channel badge (inbound only, first message) */}
        {!isOutbound && !isConsecutive && (
          <div className="text-[10px] font-medium text-muted-foreground mb-1">
            {CHANNEL_ICONS[message.channel]} {CHANNEL_LABELS[message.channel]}
          </div>
        )}

        {/* Content */}
        <p className="whitespace-pre-wrap break-words">{message.content}</p>

        {/* Media URLs */}
        {message.media_urls && message.media_urls.length > 0 && (
          <div className="mt-2 space-y-1">
            {message.media_urls.map((url, i) => (
              <a
                key={i}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  'block text-xs underline truncate',
                  isOutbound
                    ? 'text-primary-foreground/80 hover:text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                📎 Attachment {i + 1}
              </a>
            ))}
          </div>
        )}

        {/* Timestamp & status */}
        <div
          className={cn(
            'flex items-center gap-1 mt-1',
            isOutbound ? 'justify-end' : 'justify-start'
          )}
        >
          <span
            className={cn(
              'text-[10px]',
              isOutbound
                ? 'text-primary-foreground/60'
                : 'text-muted-foreground'
            )}
          >
            {formatDateTime(message.created_at)}
          </span>
          {isOutbound && <StatusIcon status={message.status} />}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Date separator
// ---------------------------------------------------------------------------

function DateSeparator({ date }: { date: string }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="flex-1 h-px bg-border" />
      <span className="text-xs text-muted-foreground font-medium">
        {formatDateTime(date)}
      </span>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface MessageThreadProps {
  messages: MessageRecord[];
  isLoading?: boolean;
  onLoadMore?: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
  emptyMessage?: string;
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MessageThread({
  messages,
  isLoading = false,
  onLoadMore,
  hasMore = false,
  loadingMore = false,
  emptyMessage = 'No messages yet',
  className,
}: MessageThreadProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Auto-scroll when new messages arrive
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, autoScroll]);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    // If user scrolls near bottom, enable auto-scroll
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 100);
  }, []);

  // Detect if messages are from different days for date separators
  const getDateKey = (date: string) => date.split('T')[0];

  // Loading state
  if (isLoading) {
    return (
      <div className={cn('flex flex-col gap-3 p-4', className)}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className={cn(
              'flex',
              i % 2 === 0 ? 'justify-end' : 'justify-start'
            )}
          >
            <div
              className={cn(
                'h-12 rounded-2xl animate-pulse bg-muted',
                i % 2 === 0 ? 'w-2/3' : 'w-1/2'
              )}
            />
          </div>
        ))}
      </div>
    );
  }

  // Empty state
  if (messages.length === 0) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center py-16 text-center',
          className
        )}
      >
        <div className="rounded-full bg-muted p-4 mb-3">
          <svg
            className="h-6 w-6 text-muted-foreground"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"
            />
          </svg>
        </div>
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className={cn('overflow-y-auto overscroll-contain', className)}
    >
      {/* Load more */}
      {hasMore && (
        <div className="sticky top-0 z-10 flex justify-center py-2 bg-gradient-to-b from-background to-transparent">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={onLoadMore}
            disabled={loadingMore}
          >
            {loadingMore ? (
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
            Load earlier messages
          </Button>
        </div>
      )}

      {/* Messages */}
      <div className="px-4 pb-4">
        {messages.map((message, index) => {
          const prevMessage = index > 0 ? messages[index - 1] : null;
          const sameDay =
            prevMessage &&
            getDateKey(prevMessage.created_at) === getDateKey(message.created_at);
          const consecutive =
            prevMessage &&
            prevMessage.direction === message.direction &&
            sameDay;

          return (
            <div key={message.id}>
              {/* Date separator */}
              {(!sameDay || index === 0) && (
                <DateSeparator date={message.created_at} />
              )}
              <MessageBubble message={message} isConsecutive={!!consecutive} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
