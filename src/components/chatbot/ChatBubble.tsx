'use client';

// ============================================================================
// EstateFlow CRM — Chat Message Bubble Component
// Phase 5 — AI Chatbot (AGENT-5-2-WEBSITE-WIDGET)
// ============================================================================

import { cn } from '@/lib/utils';
import { Check, CheckCheck } from 'lucide-react';
import PropertyCard from './PropertyCard';
import QuickReplies from './QuickReplies';
import type { WidgetChatMessage, PropertyCardData } from '@/types/chatbot';

interface ChatBubbleProps {
  message: WidgetChatMessage;
  themeColor?: string;
  onQuickReply?: (option: string) => void;
  onViewProperty?: (propertyId: string) => void;
  onScheduleVisit?: (propertyId: string) => void;
  className?: string;
}

export default function ChatBubble({
  message,
  themeColor = '#2563eb',
  onQuickReply,
  onViewProperty,
  onScheduleVisit,
  className,
}: ChatBubbleProps) {
  const isUser = message.role === 'user';
  const isBot = message.role === 'bot';

  // Format content with basic markdown-like formatting
  const renderContent = (text: string) => {
    // Simple formatting: bold, italic, links
    const formatted = text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(
        /(https?:\/\/[^\s<]+)/g,
        '<a href="$1" target="_blank" rel="noopener noreferrer" class="underline" style="color:inherit">$1</a>',
      )
      .replace(/\n/g, '<br />');

    return <span dangerouslySetInnerHTML={{ __html: formatted }} />;
  };

  // Extract property card data if rich card is a property
  const propertyCardData =
    message.richCard?.type === 'property'
      ? (message.richCard.data as PropertyCardData)
      : null;

  return (
    <div
      className={cn(
        'flex flex-col max-w-[85%]',
        isUser ? 'items-end self-end' : 'items-start self-start',
        className,
      )}
    >
      {/* Message Bubble */}
      <div
        className={cn(
          'rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm',
          isUser
            ? 'text-white rounded-br-md'
            : 'bg-muted/50 text-foreground rounded-bl-md border',
        )}
        style={isUser ? { backgroundColor: themeColor } : undefined}
      >
        {/* Text content */}
        {message.content && <div className="break-words">{renderContent(message.content)}</div>}

        {/* Rich card — property */}
        {propertyCardData && (
          <div className="mt-2">
            <PropertyCard
              property={propertyCardData}
              themeColor={themeColor}
              onViewDetails={onViewProperty}
              onScheduleVisit={onScheduleVisit}
            />
          </div>
        )}

        {/* Timestamp + Status */}
        <div
          className={cn(
            'flex items-center gap-1 mt-1',
            isUser ? 'justify-end' : 'justify-start',
          )}
        >
          <span
            className={cn(
              'text-[10px] leading-none',
              isUser ? 'text-white/70' : 'text-muted-foreground',
            )}
          >
            {formatTime(message.timestamp)}
          </span>
          {isUser && (
            <span className="text-[10px] leading-none">
              {message.status === 'read' ? (
                <CheckCheck className={cn('h-3 w-3', isUser ? 'text-white/80' : 'text-muted-foreground')} />
              ) : message.status === 'delivered' || message.status === 'sent' ? (
                <CheckCheck className={cn('h-3 w-3', isUser ? 'text-white/60' : 'text-muted-foreground')} />
              ) : message.status === 'sending' ? (
                <Check className={cn('h-3 w-3', isUser ? 'text-white/50' : 'text-muted-foreground')} />
              ) : null}
            </span>
          )}
        </div>
      </div>

      {/* Quick Replies — only after bot messages */}
      {isBot && message.quickReplies && message.quickReplies.length > 0 && (
        <QuickReplies
          options={message.quickReplies}
          onSelect={(option) => onQuickReply?.(option)}
          themeColor={themeColor}
          className="mt-1"
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Format time helper (local to component)
// ---------------------------------------------------------------------------

function formatTime(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return '';
  }
}
