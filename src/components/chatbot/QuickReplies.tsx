'use client';

// ============================================================================
// EstateFlow CRM — Quick Reply Buttons for Chat
// Phase 5 — AI Chatbot (AGENT-5-2-WEBSITE-WIDGET)
// ============================================================================

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface QuickRepliesProps {
  options: string[];
  onSelect: (option: string) => void;
  disabled?: boolean;
  themeColor?: string;
  className?: string;
  maxOptions?: number;
}

export default function QuickReplies({
  options,
  onSelect,
  disabled = false,
  themeColor = '#2563eb',
  className,
  maxOptions = 4,
}: QuickRepliesProps) {
  const visibleOptions = options.slice(0, maxOptions);

  if (visibleOptions.length === 0) return null;

  return (
    <div
      className={cn(
        'flex gap-2 overflow-x-auto py-2 px-1 scrollbar-hide',
        className,
      )}
      style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
    >
      {visibleOptions.map((option, index) => (
        <Button
          key={`${option}-${index}`}
          variant="outline"
          size="sm"
          disabled={disabled}
          onClick={() => onSelect(option)}
          className="shrink-0 whitespace-nowrap text-xs rounded-full border px-3 h-8 transition-all hover:shadow-sm"
          style={{
            borderColor: themeColor,
            color: themeColor,
          }}
        >
          {option}
        </Button>
      ))}
    </div>
  );
}
