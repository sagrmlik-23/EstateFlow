// ============================================================================
// EstateFlow CRM — AI Call Queue
// Phase 3 — AI Voice Agent
// ============================================================================
//
// Provides CRUD operations on the ai_call_queue table:
//   - queueCall          — Insert a new queued call
//   - getPendingCalls    — Fetch next pending calls (scheduled_at <= NOW())
//   - updateCallStatus   — Update status + provider call ID after initiation
//   - completeCall       — Finalize a call with transcript, recording, duration
//   - failCall           — Mark a call as failed with error details
//   - getCallHistory     — Paginated call history for a tenant
//   - getCallById        — Single call detail
// ============================================================================

import { createClient } from '@supabase/supabase-js';
import type { PaginationParams, PaginationMeta } from '@/lib/types';
import { AI_CALL_STATUSES } from '@/lib/constants';

// ---------------------------------------------------------------------------
// Supabase client singleton (lazy init, matches pattern in leads/queries.ts)
// ---------------------------------------------------------------------------

let _supabase: ReturnType<typeof createClient> | null = null;

function getDb() {
  if (_supabase) return _supabase;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      'Supabase not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY.',
    );
  }

  _supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return _supabase;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CallQueueRow {
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
}

export interface QueueCallParams {
  tenantId: string;
  leadId: string | null;
  aiAgentId: string | null;
  phone: string;
  script?: string | null;
  voice?: string | null;
  language?: string | null;
  scheduledAt?: Date | null;
  provider?: string | null;
  maxRetries?: number;
  metadata?: Record<string, unknown>;
}

export interface CallHistoryFilters {
  status?: string;
  agentId?: string;
  leadId?: string;
  outcome?: string;
  createdAfter?: string;
  createdBefore?: string;
}

export interface CallHistoryResult {
  data: CallQueueRow[];
  meta: PaginationMeta;
}

// ---------------------------------------------------------------------------
// 1. queueCall — Insert a new call into the queue
// ---------------------------------------------------------------------------

export async function queueCall(params: QueueCallParams): Promise<CallQueueRow> {
  const supabase = getDb();

  const insertData: Record<string, any> = {
    tenant_id: params.tenantId,
    lead_id: params.leadId,
    ai_agent_id: params.aiAgentId,
    phone: params.phone,
    script: params.script ?? null,
    voice: params.voice ?? null,
    language: params.language ?? 'en',
    scheduled_at: params.scheduledAt?.toISOString() ?? new Date().toISOString(),
    status: AI_CALL_STATUSES.QUEUED,
    provider: params.provider ?? null,
    max_retries: params.maxRetries ?? 3,
    retry_count: 0,
    metadata: params.metadata ?? {},
  };

  const { data, error } = await (supabase.from('ai_call_queue') as any)
    .insert(insertData)
    .select()
    .single();

  if (error) {
    console.error('[callQueue] queueCall error:', error);
    throw new Error(`Failed to queue call: ${error.message}`);
  }

  return data as CallQueueRow;
}

// ---------------------------------------------------------------------------
// 2. getPendingCalls — Fetch next pending calls ready to dial
// ---------------------------------------------------------------------------

export async function getPendingCalls(
  limit: number = 10,
): Promise<CallQueueRow[]> {
  const supabase = getDb();
  const now = new Date().toISOString();

  const { data, error } = await (supabase.from('ai_call_queue') as any)
    .select('*')
    .eq('status', AI_CALL_STATUSES.QUEUED)
    .lte('scheduled_at', now)
    .order('scheduled_at', { ascending: true })
    .limit(limit);

  if (error) {
    console.error('[callQueue] getPendingCalls error:', error);
    throw new Error(`Failed to fetch pending calls: ${error.message}`);
  }

  return (data as CallQueueRow[]) || [];
}

// ---------------------------------------------------------------------------
// 3. updateCallStatus — Update status after call initiation
// ---------------------------------------------------------------------------

export async function updateCallStatus(
  callId: string,
  status: string,
  providerCallId?: string | null,
): Promise<void> {
  const supabase = getDb();

  const updateData: Record<string, any> = {
    status,
    updated_at: new Date().toISOString(),
  };

  if (status === AI_CALL_STATUSES.RINGING || status === AI_CALL_STATUSES.IN_PROGRESS) {
    updateData.started_at = new Date().toISOString();
  }

  if (providerCallId !== undefined) {
    updateData.provider_call_id = providerCallId;
  }

  const { error } = await (supabase.from('ai_call_queue') as any)
    .update(updateData)
    .eq('id', callId);

  if (error) {
    console.error('[callQueue] updateCallStatus error:', error);
    throw new Error(`Failed to update call status: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// 4. completeCall — Finalize a call with results
// ---------------------------------------------------------------------------

export async function completeCall(
  callId: string,
  result: {
    status: string;
    outcome?: string | null;
    transcript?: string | null;
    recordingUrl?: string | null;
    durationSeconds?: number | null;
    sentiment?: string | null;
  },
): Promise<void> {
  const supabase = getDb();

  const updateData: Record<string, any> = {
    status: result.status,
    ended_at: new Date().toISOString(),
  };

  if (result.outcome !== undefined) updateData.outcome = result.outcome;
  if (result.transcript !== undefined) updateData.transcript = result.transcript;
  if (result.recordingUrl !== undefined) updateData.recording_url = result.recordingUrl;
  if (result.durationSeconds !== undefined) updateData.duration_seconds = result.durationSeconds;
  if (result.sentiment !== undefined) updateData.sentiment = result.sentiment;

  const { error } = await (supabase.from('ai_call_queue') as any)
    .update(updateData)
    .eq('id', callId);

  if (error) {
    console.error('[callQueue] completeCall error:', error);
    throw new Error(`Failed to complete call: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// 5. failCall — Mark a call as failed with error details
// ---------------------------------------------------------------------------

export async function failCall(
  callId: string,
  errorMessage: string,
): Promise<void> {
  const supabase = getDb();

  // First, get current call data to check retry count
  const { data: current, error: fetchError } = await (supabase
    .from('ai_call_queue') as any)
    .select('retry_count, max_retries')
    .eq('id', callId)
    .single();

  if (fetchError) {
    console.error('[callQueue] failCall fetch error:', fetchError);
    // Still attempt to mark as failed
  }

  const retryCount = (current?.retry_count ?? 0) + 1;
  const maxRetries = current?.max_retries ?? 3;
  const shouldRetry = retryCount < maxRetries;

  const updateData: Record<string, any> = {
    status: shouldRetry ? AI_CALL_STATUSES.QUEUED : AI_CALL_STATUSES.FAILED,
    error: errorMessage,
    retry_count: retryCount,
    ended_at: new Date().toISOString(),
  };

  // If we should retry, bump the scheduled_at forward by some delay
  if (shouldRetry) {
    const delayMinutes = Math.min(30, Math.pow(2, retryCount) * 5); // 5, 10, 20 min backoff
    const nextAttempt = new Date(Date.now() + delayMinutes * 60_000);
    updateData.scheduled_at = nextAttempt.toISOString();
  }

  const { error: updateErr } = await (supabase.from('ai_call_queue') as any)
    .update(updateData)
    .eq('id', callId);

  if (updateErr) {
    console.error('[callQueue] failCall update error:', updateErr);
    throw new Error(`Failed to record call failure: ${updateErr.message}`);
  }
}

// ---------------------------------------------------------------------------
// 6. getCallHistory — Paginated call history for a tenant
// ---------------------------------------------------------------------------

export async function getCallHistory(
  tenantId: string,
  filters: CallHistoryFilters = {},
  pagination: PaginationParams = { page: 1, limit: 20, offset: 0 },
): Promise<CallHistoryResult> {
  const supabase = getDb();

  let query = (supabase.from('ai_call_queue') as any)
    .select('*', { count: 'exact' })
    .eq('tenant_id', tenantId);

  // Apply filters
  if (filters.status) {
    query = query.eq('status', filters.status);
  }
  if (filters.agentId) {
    query = query.eq('ai_agent_id', filters.agentId);
  }
  if (filters.leadId) {
    query = query.eq('lead_id', filters.leadId);
  }
  if (filters.outcome) {
    query = query.eq('outcome', filters.outcome);
  }
  if (filters.createdAfter) {
    query = query.gte('created_at', filters.createdAfter);
  }
  if (filters.createdBefore) {
    query = query.lte('created_at', filters.createdBefore);
  }

  query = query
    .order('created_at', { ascending: false })
    .range(pagination.offset, pagination.offset + pagination.limit - 1);

  const { data, error, count } = await query;

  if (error) {
    console.error('[callQueue] getCallHistory error:', error);
    throw new Error(`Failed to fetch call history: ${error.message}`);
  }

  const total = count ?? 0;

  return {
    data: (data as CallQueueRow[]) || [],
    meta: {
      page: pagination.page,
      limit: pagination.limit,
      total,
      total_pages: Math.ceil(total / pagination.limit),
    },
  };
}

// ---------------------------------------------------------------------------
// 7. getCallById — Single call detail
// ---------------------------------------------------------------------------

export async function getCallById(callId: string): Promise<CallQueueRow | null> {
  const supabase = getDb();

  const { data, error } = await (supabase.from('ai_call_queue') as any)
    .select('*')
    .eq('id', callId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    console.error('[callQueue] getCallById error:', error);
    throw new Error(`Failed to fetch call: ${error.message}`);
  }

  return data as CallQueueRow;
}
