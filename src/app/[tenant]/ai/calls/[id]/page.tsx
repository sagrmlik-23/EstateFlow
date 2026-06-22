'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Phone,
  Clock,
  User,
  Bot,
  Headphones,
  BarChart3,
  Lightbulb,
  AlertCircle,
  Loader2,
  Play,
  Pause,
  ExternalLink,
  Star,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Toaster } from '@/components/ui/toaster';
import CallTranscript from '@/components/ai/CallTranscript';
import { formatDateTime, formatDate } from '@/lib/utils';
import type { TranscriptEntry } from '@/types/ai';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface CallDetail {
  id: string;
  tenant_id: string;
  lead_id: string | null;
  ai_agent_id: string | null;
  phone: string;
  script: string | null;
  voice: string | null;
  language: string | null;
  scheduled_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  status: string;
  provider: string | null;
  provider_call_id: string | null;
  recording_url: string | null;
  transcript: string | null;
  sentiment: string | null;
  duration_seconds: number | null;
  outcome: string | null;
  retry_count: number;
  max_retries: number;
  error: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  // Joined fields
  lead_name?: string;
  agent_name?: string;
}

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------
const STATUS_STYLES: Record<string, string> = {
  queued: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  ringing: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  in_progress: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  completed: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  no_answer: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
  busy: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  cancelled: 'bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-400',
};

const STATUS_LABELS: Record<string, string> = {
  queued: 'Queued',
  ringing: 'Ringing',
  in_progress: 'In Progress',
  completed: 'Completed',
  failed: 'Failed',
  no_answer: 'No Answer',
  busy: 'Busy',
  cancelled: 'Cancelled',
};

const OUTCOME_LABELS: Record<string, string> = {
  interested: 'Interested',
  not_interested: 'Not Interested',
  callback: 'Callback Scheduled',
  site_visit: 'Site Visit Booked',
  wrong_number: 'Wrong Number',
  no_answer: 'No Answer',
};

const OUTCOME_STYLES: Record<string, string> = {
  interested: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  not_interested: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  callback: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  site_visit: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  wrong_number: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
  no_answer: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
};

const SENTIMENT_LABELS: Record<string, { label: string; color: string }> = {
  positive: { label: 'Positive', color: 'text-green-600' },
  neutral: { label: 'Neutral', color: 'text-yellow-600' },
  negative: { label: 'Negative', color: 'text-red-600' },
  interested: { label: 'Interested', color: 'text-green-600' },
  not_interested: { label: 'Not Interested', color: 'text-red-600' },
  frustrated: { label: 'Frustrated', color: 'text-orange-600' },
  angry: { label: 'Angry', color: 'text-red-700' },
  confused: { label: 'Confused', color: 'text-yellow-600' },
};

function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

function parseTranscript(text: string | null): TranscriptEntry[] {
  if (!text) return [];

  // Try parsing as JSON array first
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].role) {
      return parsed as TranscriptEntry[];
    }
  } catch {
    // Not JSON, try plain text
  }

  // Try multi-line format: "ROLE: text" per line
  const lines = text.split('\n').filter(Boolean);
  const entries: TranscriptEntry[] = [];

  for (const line of lines) {
    const agentMatch = line.match(/^Agent[:\s]+(.+)$/i);
    const userMatch = line.match(/^(User|Lead|Customer|Caller)[:\s]+(.+)$/i);

    if (agentMatch) {
      entries.push({ role: 'agent', text: agentMatch[1]!.trim() });
    } else if (userMatch) {
      entries.push({ role: 'user', text: userMatch[2]!.trim() });
    } else {
      // If we can't detect role, skip the line
      continue;
    }
  }

  return entries;
}

function formatCost(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return '—';
  // Rough estimate: $0.05/min for AI voice calls
  const cost = (seconds / 60) * 0.05;
  return `$${cost.toFixed(2)}`;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function AICallDetailPage({
  params,
}: {
  params: Promise<{ tenant: string; id: string }>;
}) {
  const router = useRouter();
  const [tenant, setTenant] = useState('');
  const [callId, setCallId] = useState('');
  const [call, setCall] = useState<CallDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // Resolve params
  useEffect(() => {
    params.then((p) => {
      setTenant(p.tenant);
      setCallId(p.id);
    });
  }, [params]);

  // Fetch call detail
  const fetchCall = useCallback(async () => {
    if (!callId || !tenant) return;
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/ai/calls/${callId}`, {
        headers: {
          'x-user-id': 'current-user',
          'x-tenant-id': tenant,
          'x-user-role': 'org_admin',
        },
      });

      const response = await res.json();

      if (!res.ok) {
        throw new Error(response.error || 'Failed to fetch call details');
      }

      setCall(response.data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [callId, tenant]);

  useEffect(() => {
    if (callId && tenant) {
      fetchCall();
    }
  }, [callId, tenant, fetchCall]);

  // Parse transcript
  const transcriptEntries: TranscriptEntry[] = call
    ? parseTranscript(call.transcript)
    : [];

  // Sentiment indicator
  const sentimentInfo = call?.sentiment
    ? SENTIMENT_LABELS[call.sentiment.toLowerCase()] || {
        label: call.sentiment,
        color: 'text-gray-600',
      }
    : null;

  // -------------------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------------------
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
          <div className="animate-pulse space-y-6">
            <div className="h-8 w-32 rounded bg-muted" />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-24 rounded-lg bg-muted" />
              ))}
            </div>
            <div className="h-64 rounded-lg bg-muted" />
            <div className="h-48 rounded-lg bg-muted" />
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Error state
  // -------------------------------------------------------------------------
  if (error || !call) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="rounded-full bg-destructive/10 p-4 mb-4 inline-block">
            <AlertCircle className="h-8 w-8 text-destructive" />
          </div>
          <h2 className="text-xl font-semibold mb-2">
            {error || 'Call not found'}
          </h2>
          <p className="text-muted-foreground mb-4">
            {error
              ? 'Something went wrong while loading this call.'
              : 'The call record you are looking for does not exist.'}
          </p>
          <div className="flex items-center justify-center gap-2">
            <Button variant="outline" onClick={() => router.back()}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              Go Back
            </Button>
            <Button variant="outline" onClick={fetchCall}>
              <Loader2 className="h-4 w-4 mr-1" />
              Retry
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

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Back */}
        <button
          onClick={() => router.back()}
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Call History
        </button>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Call info cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                    <Clock className="h-3 w-3" />
                    Duration
                  </div>
                  <p className="text-lg font-semibold">
                    {formatDuration(call.duration_seconds)}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                    <BarChart3 className="h-3 w-3" />
                    Status
                  </div>
                  <span
                    className={cn(
                      'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                      STATUS_STYLES[call.status] || 'bg-gray-100 text-gray-800'
                    )}
                  >
                    {STATUS_LABELS[call.status] || call.status}
                  </span>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                    <Star className="h-3 w-3" />
                    Outcome
                  </div>
                  <p className="text-sm font-semibold">
                    {call.outcome ? (
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                          OUTCOME_STYLES[call.outcome] || 'bg-gray-100 text-gray-800'
                        )}
                      >
                        {OUTCOME_LABELS[call.outcome] || call.outcome}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                    <BarChart3 className="h-3 w-3" />
                    Cost
                  </div>
                  <p className="text-lg font-semibold">
                    {formatCost(call.duration_seconds)}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Recording player */}
            {call.recording_url && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Headphones className="h-4 w-4" />
                    Call Recording
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-10 w-10 rounded-full"
                      onClick={() => setIsPlaying(!isPlaying)}
                    >
                      {isPlaying ? (
                        <Pause className="h-4 w-4" />
                      ) : (
                        <Play className="h-4 w-4 ml-0.5" />
                      )}
                    </Button>
                    <div className="flex-1 min-w-0">
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div className="h-full w-0 bg-primary rounded-full" />
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1 text-xs"
                      onClick={() =>
                        window.open(call.recording_url!, '_blank')
                      }
                    >
                      <ExternalLink className="h-3 w-3" />
                      Open
                    </Button>
                  </div>
                  {/* Audio element (hidden, used for playback) */}
                  <audio
                    src={call.recording_url}
                    controls
                    className="hidden"
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                    onEnded={() => setIsPlaying(false)}
                  />
                </CardContent>
              </Card>
            )}

            {/* Sentiment */}
            {sentimentInfo && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <BarChart3 className="h-4 w-4" />
                    Call Sentiment
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        'text-lg font-bold',
                        sentimentInfo.color
                      )}
                    >
                      {sentimentInfo.label}
                    </div>
                    <div className="flex gap-1">
                      {['negative', 'neutral', 'positive'].map((level) => (
                        <div
                          key={level}
                          className={cn(
                            'h-8 w-8 rounded-full flex items-center justify-center text-xs font-medium border',
                            call.sentiment?.toLowerCase() === level
                              ? level === 'positive'
                                ? 'bg-green-100 border-green-300 text-green-700'
                                : level === 'negative'
                                  ? 'bg-red-100 border-red-300 text-red-700'
                                  : 'bg-yellow-100 border-yellow-300 text-yellow-700'
                              : 'bg-muted border-transparent text-muted-foreground'
                          )}
                        >
                          {level === 'positive'
                            ? '😊'
                            : level === 'negative'
                              ? '😞'
                              : '😐'}
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Transcript */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Bot className="h-4 w-4" />
                  Transcript
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CallTranscript
                  entries={transcriptEntries}
                  compact
                />
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Lead info */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Lead Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-xs text-muted-foreground">Name</p>
                  <p className="text-sm font-medium">
                    {call.lead_name || 'Unknown'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Phone</p>
                  <p className="text-sm font-medium">{call.phone || '—'}</p>
                  {call.phone && (
                    <Button
                      variant="link"
                      size="sm"
                      className="h-5 p-0 text-xs"
                      onClick={() => window.open(`tel:${call.phone}`, '_blank')}
                    >
                      <Phone className="h-3 w-3 mr-1" />
                      Call back
                    </Button>
                  )}
                </div>
                <Separator />
                <div>
                  <p className="text-xs text-muted-foreground">Agent</p>
                  <p className="text-sm font-medium">
                    {call.agent_name || '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Called At</p>
                  <p className="text-sm font-medium">
                    {formatDateTime(call.created_at)}
                  </p>
                </div>
                {call.started_at && (
                  <div>
                    <p className="text-xs text-muted-foreground">Started</p>
                    <p className="text-sm font-medium">
                      {formatDateTime(call.started_at)}
                    </p>
                  </div>
                )}
                {call.ended_at && (
                  <div>
                    <p className="text-xs text-muted-foreground">Ended</p>
                    <p className="text-sm font-medium">
                      {formatDateTime(call.ended_at)}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* AI Insights */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Lightbulb className="h-4 w-4 text-yellow-500" />
                  AI Insights
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Interest Level */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-muted-foreground">
                      Interest Level
                    </span>
                    <span
                      className={cn(
                        'text-xs font-semibold',
                        call.outcome === 'interested' || call.outcome === 'site_visit'
                          ? 'text-green-600'
                          : call.outcome === 'callback'
                            ? 'text-yellow-600'
                            : 'text-muted-foreground'
                      )}
                    >
                      {call.outcome === 'interested' || call.outcome === 'site_visit'
                        ? 'High'
                        : call.outcome === 'callback'
                          ? 'Medium'
                          : call.outcome === 'not_interested'
                            ? 'Low'
                            : 'Unknown'}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full',
                        call.outcome === 'interested' || call.outcome === 'site_visit'
                          ? 'w-3/4 bg-green-500'
                          : call.outcome === 'callback'
                            ? 'w-1/2 bg-yellow-500'
                            : call.outcome === 'not_interested'
                              ? 'w-1/4 bg-red-500'
                              : 'w-0'
                      )}
                    />
                  </div>
                </div>

                {/* Objections detected */}
                <div>
                  <p className="text-xs text-muted-foreground mb-1">
                    Detected Objections
                  </p>
                  {call.outcome === 'not_interested' ? (
                    <ul className="text-xs space-y-1">
                      <li className="flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-red-400 shrink-0" />
                        Budget concerns
                      </li>
                      <li className="flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-yellow-400 shrink-0" />
                        Timing not right
                      </li>
                    </ul>
                  ) : call.outcome === 'interested' ? (
                    <ul className="text-xs space-y-1">
                      <li className="flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-green-400 shrink-0" />
                        No major objections
                      </li>
                    </ul>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      No objections recorded
                    </p>
                  )}
                </div>

                {/* Suggested next action */}
                <div>
                  <p className="text-xs text-muted-foreground mb-1">
                    Suggested Next Action
                  </p>
                  <p className="text-sm">
                    {call.outcome === 'interested'
                      ? 'Schedule a site visit'
                      : call.outcome === 'site_visit'
                        ? 'Prepare property documents'
                        : call.outcome === 'callback'
                          ? 'Set reminder for callback'
                          : call.outcome === 'not_interested'
                            ? 'Move to nurturing sequence'
                            : 'Review call transcript'}
                  </p>
                </div>

                {/* Retry info */}
                {call.retry_count > 0 && (
                  <div className="rounded-lg bg-yellow-50 dark:bg-yellow-900/20 p-3">
                    <p className="text-xs text-yellow-700 dark:text-yellow-400">
                      This call was retried {call.retry_count} time
                      {call.retry_count !== 1 ? 's' : ''} (max {call.max_retries})
                    </p>
                  </div>
                )}

                {/* Error info */}
                {call.error && (
                  <div className="rounded-lg bg-red-50 dark:bg-red-900/20 p-3">
                    <p className="text-xs text-red-700 dark:text-red-400 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3 shrink-0" />
                      {call.error}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
