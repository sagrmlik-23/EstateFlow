'use client';

// ============================================================================
// EstateFlow CRM — Floating Chatbot Widget
// Phase 5 — AI Chatbot (AGENT-5-2-WEBSITE-WIDGET)
// ============================================================================

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  MessageCircle,
  X,
  Send,
  Minus,
  Smile,
  Paperclip,
  Loader2,
  Bot,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import ChatBubble from './ChatBubble';
import type { WidgetChatMessage, WidgetBotResponse } from '@/types/chatbot';

// ---------------------------------------------------------------------------
// Emoji list for picker
// ---------------------------------------------------------------------------

const EMOJIS = [
  '😀', '😂', '😊', '😍', '🥰', '😎', '🤔', '👋',
  '👍', '👎', '❤️', '🔥', '🎉', '💯', '✅', '❌',
  '🏠', '🏢', '💰', '📍', '📞', '📧', '📅', '🔑',
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ChatWidgetProps {
  tenantId: string;
  botName?: string;
  themeColor?: string;
  welcomeMessage?: string;
  position?: 'right' | 'left';
  icon?: 'chat' | 'bubble' | 'robot' | 'message';
  baseUrl?: string;
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ChatWidget({
  tenantId,
  botName = 'EstateFlow Assistant',
  themeColor = '#2563eb',
  welcomeMessage = 'Hi there! 👋 How can I help you find your dream property?',
  position = 'right',
  icon = 'chat',
  baseUrl,
  className,
}: ChatWidgetProps) {
  // -----------------------------------------------------------------------
  // State
  // -----------------------------------------------------------------------

  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<WidgetChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const widgetRef = useRef<HTMLDivElement>(null);
  const isLoadingRef = useRef(isLoading);
  isLoadingRef.current = isLoading;

  // -----------------------------------------------------------------------
  // Initialize: send welcome message
  // -----------------------------------------------------------------------

  useEffect(() => {
    if (!isInitialized) {
      const welcomeMsg: WidgetChatMessage = {
        id: `welcome-${crypto.randomUUID()}`,
        sessionId: '',
        role: 'bot',
        content: welcomeMessage,
        status: 'delivered',
        timestamp: new Date().toISOString(),
        quickReplies: [
          'Show me properties',
          'I want to buy',
          'I want to rent',
          'Contact me',
        ],
      };
      setMessages([welcomeMsg]);
      setIsInitialized(true);
    }
  }, [welcomeMessage, isInitialized]);

  // -----------------------------------------------------------------------
  // Scroll to bottom
  // -----------------------------------------------------------------------

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 50);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping, scrollToBottom]);

  // -----------------------------------------------------------------------
  // Track unread count when minimized
  // -----------------------------------------------------------------------

  useEffect(() => {
    if (!isOpen || isMinimized) {
      // Count new bot messages
      const newBotMessages = messages.filter(
        (m) => m.role === 'bot' && m.status === 'delivered',
      ).length;
      const prevCount = messages.filter((m) => m.role === 'user').length;
      setUnreadCount(Math.max(0, newBotMessages - prevCount));
    } else {
      setUnreadCount(0);
    }
  }, [messages, isOpen, isMinimized]);

  // -----------------------------------------------------------------------
  // Sound notification
  // -----------------------------------------------------------------------

  const playNotificationSound = useCallback(() => {
    try {
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.frequency.setValueAtTime(800, ctx.currentTime);
      oscillator.frequency.setValueAtTime(1000, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.3);
    } catch {
      // Audio not supported — silently ignore
    }
  }, []);

  // -----------------------------------------------------------------------
  // Send message
  // -----------------------------------------------------------------------

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isLoadingRef.current) return;

      const trimmed = text.trim();
      setInput('');
      setShowEmojiPicker(false);
      setError(null);

      // Add user message
      const userMsg: WidgetChatMessage = {
        id: `user-${crypto.randomUUID()}`,
        sessionId: sessionId ?? '',
        role: 'user',
        content: trimmed,
        status: 'sending',
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setIsLoading(true);
      setIsTyping(true);

      try {
        const origin = baseUrl ?? window.location.origin;
        const res = await fetch(`${origin}/api/chatbot/widget/message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            tenantId,
            message: trimmed,
          }),
        });

        if (!res.ok) {
          throw new Error(`Server responded with ${res.status}`);
        }

        const data: { sessionId: string; response: WidgetBotResponse } = await res.json();

        // Update session
        setSessionId(data.sessionId);

        // Mark user msg as delivered
        setMessages((prev) =>
          prev.map((m) =>
            m.id === userMsg.id ? { ...m, status: 'delivered' as const } : m,
          ),
        );

        // Add bot response
        const botMsg: WidgetChatMessage = {
          id: `bot-${crypto.randomUUID()}`,
          sessionId: data.sessionId,
          role: 'bot',
          content: data.response.message,
          status: 'delivered',
          timestamp: new Date().toISOString(),
          richCard: data.response.richCard ?? null,
          quickReplies: data.response.quickReplies,
        };

        // Delay typing indicator
        await new Promise((r) => setTimeout(r, 600 + Math.random() * 400));

        setIsTyping(false);
        setMessages((prev) => [...prev, botMsg]);
        playNotificationSound();
      } catch (err) {
        setIsTyping(false);
        const errorMsg =
          err instanceof Error ? err.message : 'Failed to send message';
        setError(errorMsg);

        // Mark user msg as failed
        setMessages((prev) =>
          prev.map((m) =>
            m.id === userMsg.id ? { ...m, status: 'failed' as const } : m,
          ),
        );
      } finally {
        setIsLoading(false);
      }
    },
    [sessionId, tenantId, baseUrl, playNotificationSound],
  );

  // -----------------------------------------------------------------------
  // Handle submit
  // -----------------------------------------------------------------------

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  // -----------------------------------------------------------------------
  // Handle quick reply
  // -----------------------------------------------------------------------

  const handleQuickReply = (option: string) => {
    sendMessage(option);
  };

  // -----------------------------------------------------------------------
  // Handle file attachment
  // -----------------------------------------------------------------------

  const handleFileAttach = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // In a full implementation, this would upload the file
      // For now, just inform the user
      sendMessage(`[Attached: ${file.name}]`);
    }
    // Reset input so same file can be selected again
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // -----------------------------------------------------------------------
  // Handle emoji select
  // -----------------------------------------------------------------------

  const handleEmojiSelect = (emoji: string) => {
    setInput((prev) => prev + emoji);
    setShowEmojiPicker(false);
    inputRef.current?.focus();
  };

  // -----------------------------------------------------------------------
  // Handle view property details
  // -----------------------------------------------------------------------

  const handleViewProperty = (propertyId: string) => {
    window.open(`/properties/${propertyId}`, '_blank');
  };

  // -----------------------------------------------------------------------
  // Handle schedule visit
  // -----------------------------------------------------------------------

  const handleScheduleVisit = (propertyId: string) => {
    sendMessage(`I'd like to schedule a visit for property ${propertyId}`);
  };

  // -----------------------------------------------------------------------
  // Widget icon
  // -----------------------------------------------------------------------

  const WidgetIcon = () => {
    switch (icon) {
      case 'robot':
        return <Bot className="h-6 w-6" />;
      case 'bubble':
        return <MessageCircle className="h-6 w-6" />;
      case 'message':
        return <MessageCircle className="h-6 w-6" />;
      case 'chat':
      default:
        return <Sparkles className="h-6 w-6" />;
    }
  };

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  const isOpenOrMinimized = isOpen || isMinimized;

  return (
    <div
      ref={widgetRef}
      className={cn('fixed bottom-4 z-[9999] flex flex-col items-end', className)}
      style={{ [position]: '1rem' }}
    >
      {/* Chat Panel */}
      {isOpenOrMinimized && (
        <div
          className={cn(
            'mb-3 overflow-hidden rounded-2xl border bg-background shadow-2xl transition-all duration-300',
            isMinimized ? 'h-14' : 'h-[520px] w-[360px] sm:w-[380px]',
          )}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3 text-white"
            style={{ backgroundColor: themeColor }}
          >
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20">
                <MessageCircle className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold leading-tight">{botName}</p>
                <p className="text-[10px] text-white/70 leading-tight">
                  {isTyping ? 'Typing...' : 'Online'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setIsMinimized(!isMinimized)}
                className="rounded-full p-1.5 hover:bg-white/20 transition-colors"
                aria-label={isMinimized ? 'Expand' : 'Minimize'}
              >
                <Minus className="h-4 w-4" />
              </button>
              <button
                onClick={() => {
                  setIsOpen(false);
                  setIsMinimized(false);
                }}
                className="rounded-full p-1.5 hover:bg-white/20 transition-colors"
                aria-label="Close chat"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Messages */}
          {!isMinimized && (
            <>
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 h-[380px]">
                {messages.map((msg) => (
                  <ChatBubble
                    key={msg.id}
                    message={msg}
                    themeColor={themeColor}
                    onQuickReply={handleQuickReply}
                    onViewProperty={handleViewProperty}
                    onScheduleVisit={handleScheduleVisit}
                  />
                ))}

                {/* Typing indicator */}
                {isTyping && (
                  <div className="flex items-start self-start max-w-[85%]">
                    <div className="rounded-2xl rounded-bl-md bg-muted/50 border px-4 py-3">
                      <div className="flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  </div>
                )}

                {/* Error state */}
                {error && (
                  <div className="flex items-center justify-center py-2">
                    <div className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
                      {error}
                      <button
                        onClick={() => setError(null)}
                        className="ml-2 underline"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <form
                onSubmit={handleSubmit}
                className="flex items-center gap-2 border-t px-3 py-2.5"
              >
                {/* Attachment */}
                <button
                  type="button"
                  onClick={handleFileAttach}
                  className="shrink-0 rounded-full p-1.5 text-muted-foreground hover:bg-muted transition-colors"
                  aria-label="Attach file"
                >
                  <Paperclip className="h-4 w-4" />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,.pdf,.doc,.docx"
                  className="hidden"
                  onChange={handleFileChange}
                />

                {/* Emoji */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                    className="shrink-0 rounded-full p-1.5 text-muted-foreground hover:bg-muted transition-colors"
                    aria-label="Emoji picker"
                  >
                    <Smile className="h-4 w-4" />
                  </button>

                  {/* Emoji Picker Popover */}
                  {showEmojiPicker && (
                    <div className="absolute bottom-full left-0 mb-2 grid grid-cols-8 gap-1 rounded-xl border bg-background p-2 shadow-lg">
                      {EMOJIS.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => handleEmojiSelect(emoji)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-lg hover:bg-muted transition-colors"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Text Input */}
                <Input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Type a message..."
                  className="flex-1 h-9 border-0 bg-muted/50 rounded-full px-3 text-sm focus-visible:ring-1"
                  disabled={isLoading}
                />

                {/* Send */}
                <Button
                  type="submit"
                  size="icon"
                  disabled={!input.trim() || isLoading}
                  className="shrink-0 h-9 w-9 rounded-full"
                  style={{ backgroundColor: themeColor }}
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </form>
            </>
          )}
        </div>
      )}

      {/* Floating Button */}
      <button
        onClick={() => {
          setIsOpen(!isOpen);
          setIsMinimized(false);
          if (!isOpen) setUnreadCount(0);
        }}
        className={cn(
          'relative flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-transform hover:scale-105 active:scale-95',
        )}
        style={{ backgroundColor: themeColor }}
        aria-label={isOpen ? 'Close chat' : `Open ${botName} chat`}
      >
        {isOpen ? (
          <X className="h-6 w-6 text-white" />
        ) : (
          <WidgetIcon />
        )}

        {/* Unread badge */}
        {unreadCount > 0 && !isOpen && (
          <span className="absolute -top-1 -right-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white shadow">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>
    </div>
  );
}
