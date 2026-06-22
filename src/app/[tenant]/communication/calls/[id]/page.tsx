'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Phone,
  Clock,
  User,
  Headphones,
  AlertCircle,
  Loader2,
  Play,
  Pause,
  ExternalLink,
  PhoneIncoming,
  PhoneOutgoing,
  FileText,
  DollarSign,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Toaster } from '@/components/ui/toaster';
import { formatDateTime } from '@/lib/utils';
import type { CallRecord } from '@/types/communication';

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
  missed: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400',
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
  missed: 'Missed',
};

function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

function formatCost(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return '—';
  // Rough estimate: $0.02/min for voice calls
  const cost = (seconds / 60) * 0.02;
  return `$${cost.toFixed(2)}`;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CommunicationCallDetailPage({
  params,
}: {
  params: Promise<{ tenant: string; id: string }>;
}) {
  const router = useRouter();
  const [tenant, setTenant] = useState('');
  const [callId, setCallId] = useState('');
  const [call, setCall] = useState<CallRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [notes, setNotes] = useState('');
  const [isSavingNotes, setIsSavingNotes] = useState(false);

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
      const res = await fetch(`/api/communication/calls/${callId}`, {
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

      const callData = response.data as CallRecord;
      setCall(callData);
      if (callData.notes) {
        setNotes(callData.notes);
      }
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

  // Save notes
  const handleSaveNotes = async () => {
    if (!call) return;
    setIsSavingNotes(true);
    try {
      await fetch(`/api/communication/calls/${callId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': 'current-user',
          'x-tenant-id': tenant,
          'x-user-role': 'org_admin',
        },
        body: JSON.stringify({ notes }),
      });
    } catch {
      // Silently fail - notes are non-critical
    } finally {
      setIsSavingNotes(false);
    }
  };

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
            <div className="h-40 rounded-lg bg-muted" />
            <div className="h-32 rounded-lg bg-muted" />
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
                    {formatDuration(call.durationSeconds)}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                    <Phone className="h-3 w-3" />
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
                    {call.direction === 'inbound' ? (
                      <PhoneIncoming className="h-3 w-3 text-green-600" />
                    ) : (
                      <PhoneOutgoing className="h-3 w-3 text-blue-600" />
                    )}
                    Direction
                  </div>
                  <p className="text-sm font-semibold capitalize">{call.direction}</p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                    <DollarSign className="h-3 w-3" />
                    Cost
                  </div>
                  <p className="text-lg font-semibold">
                    {formatCost(call.durationSeconds)}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Participant info */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Participants
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Caller</span>
                    <span className="font-medium">
                      {call.callerPhone || '—'}
                    </span>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Callee</span>
                    <span className="font-medium">
                      {call.calleePhone || '—'}
                    </span>
                  </div>
                  {call.leadId && (
                    <>
                      <Separator />
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Lead ID</span>
                        <span className="font-medium font-mono text-xs">
                          {call.leadId}
                        </span>
                      </div>
                    </>
                  )}
                  {call.agentId && (
                    <>
                      <Separator />
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Agent ID</span>
                        <span className="font-medium font-mono text-xs">
                          {call.agentId}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Recording player */}
            {call.recordingUrl && (
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
                        <div
                          className={cn(
                            'h-full bg-primary rounded-full transition-all',
                            isPlaying ? 'w-1/2' : 'w-0'
                          )}
                        />
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1 text-xs"
                      onClick={() => window.open(call.recordingUrl!, '_blank')}
                    >
                      <ExternalLink className="h-3 w-3" />
                      Open
                    </Button>
                  </div>
                  <audio
                    src={call.recordingUrl}
                    controls
                    className="hidden"
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                    onEnded={() => setIsPlaying(false)}
                  />
                </CardContent>
              </Card>
            )}

            {/* Call details */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Call Details
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Date & Time</span>
                    <span className="font-medium">
                      {formatDateTime(call.createdAt)}
                    </span>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Provider</span>
                    <span className="font-medium capitalize">
                      {call.provider || '—'}
                    </span>
                  </div>
                  {call.providerCallSid && (
                    <>
                      <Separator />
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Provider Call SID</span>
                        <span className="font-medium font-mono text-xs">
                          {call.providerCallSid}
                        </span>
                      </div>
                    </>
                  )}
                  {call.price !== null && call.price !== undefined && (
                    <>
                      <Separator />
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Price</span>
                        <span className="font-medium">
                          ${call.price.toFixed(4)}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Quick info */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Duration</span>
                  <span>{formatDuration(call.durationSeconds)}</span>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <span
                    className={cn(
                      'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                      STATUS_STYLES[call.status] || 'bg-gray-100 text-gray-800'
                    )}
                  >
                    {STATUS_LABELS[call.status] || call.status}
                  </span>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Direction</span>
                  <span className="flex items-center gap-1 capitalize">
                    {call.direction === 'inbound' ? (
                      <PhoneIncoming className="h-3 w-3 text-green-600" />
                    ) : (
                      <PhoneOutgoing className="h-3 w-3 text-blue-600" />
                    )}
                    {call.direction}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Notes */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Notes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  placeholder="Add notes about this call..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={5}
                  className="text-sm resize-y min-h-[100px]"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={handleSaveNotes}
                  disabled={isSavingNotes}
                >
                  {isSavingNotes ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save Notes'
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
