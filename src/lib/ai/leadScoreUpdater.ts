// ============================================================================
// EstateFlow CRM — Lead Score Updater from AI Call Insights
// Phase 3 — AI Voice Agent (AGENT-3-4-ANALYTICS-INSIGHTS)
// ============================================================================
//
// Updates lead scores and statuses based on AI call analysis results:
//   - updateLeadScoreFromCall  — Adjust lead score from call insights
//   - appendCallNotes          — Append call transcript/summary to lead notes
//   - updateAgentConversionRate — Recalculate agent conversion rate
// ============================================================================

import { createClient } from '@supabase/supabase-js';
import type { TranscriptAnalysis } from './transcriptAnalysis';

// ---------------------------------------------------------------------------
// Supabase client singleton (lazy init)
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

export interface ScoreUpdateResult {
  leadId: string;
  previousScore: number;
  newScore: number;
  scoreDelta: number;
  statusBefore: string;
  statusAfter: string;
  statusUpdated: boolean;
}

// ---------------------------------------------------------------------------
// 1. updateLeadScoreFromCall — Adjust lead score from call insights
// ---------------------------------------------------------------------------

/**
 * Update a lead's AI score and potentially its status based on call insights.
 *
 * Scoring rules:
 *   - interestLevel > 70: +20 points
 *   - interestLevel > 40: +10 points
 *   - otherwise: -10 points
 *   - Score is clamped to [0, 100]
 *   - Status updated to 'qualified' if score >= 60
 *   - Status updated to 'qualified' if score >= 80
 */
export async function updateLeadScoreFromCall(
  leadId: string,
  insights: TranscriptAnalysis,
): Promise<ScoreUpdateResult> {
  const supabase = getDb();

  // Fetch current lead data
  const { data: lead, error: fetchError } = await (supabase
    .from('leads') as any)
    .select('id, ai_score, status')
    .eq('id', leadId)
    .single();

  if (fetchError) {
    console.error('[leadScoreUpdater] Fetch lead error:', fetchError);
    throw new Error(`Failed to fetch lead ${leadId}: ${fetchError.message}`);
  }

  if (!lead) {
    throw new Error(`Lead not found: ${leadId}`);
  }

  const previousScore = lead.ai_score ?? 50;
  const statusBefore = lead.status;

  // Calculate score delta based on interest level
  let delta: number;
  if (insights.interestLevel > 70) {
    delta = 20;
  } else if (insights.interestLevel > 40) {
    delta = 10;
  } else {
    delta = -10;
  }

  // Apply and clamp to [0, 100]
  const newScore = Math.max(0, Math.min(100, previousScore + delta));

  // Determine new status based on score
  let newStatus = statusBefore;
  let statusUpdated = false;

  if (newScore >= 80 && statusBefore !== 'qualified' && statusBefore !== 'closed_won') {
    newStatus = 'qualified';
    statusUpdated = true;
  } else if (newScore >= 60 && statusBefore === 'new') {
    newStatus = 'qualified';
    statusUpdated = true;
  }

  // Update the lead
  const updateData: Record<string, any> = {
    ai_score: newScore,
    updated_at: new Date().toISOString(),
  };

  if (statusUpdated) {
    updateData.status = newStatus;
  }

  const { error: updateError } = await (supabase.from('leads') as any)
    .update(updateData)
    .eq('id', leadId);

  if (updateError) {
    console.error('[leadScoreUpdater] Update lead error:', updateError);
    throw new Error(`Failed to update lead score: ${updateError.message}`);
  }

  return {
    leadId,
    previousScore,
    newScore,
    scoreDelta: delta,
    statusBefore,
    statusAfter: statusUpdated ? newStatus : statusBefore,
    statusUpdated,
  };
}

// ---------------------------------------------------------------------------
// 2. appendCallNotes — Append call transcript and summary to lead notes
// ---------------------------------------------------------------------------

/**
 * Append a call transcript and summary to the lead's notes field.
 * Preprends a timestamped header for clarity.
 */
export async function appendCallNotes(
  leadId: string,
  callId: string,
  transcript: string,
  summary: string,
): Promise<void> {
  const supabase = getDb();

  // Fetch current notes
  const { data: lead, error: fetchError } = await (supabase
    .from('leads') as any)
    .select('id, notes')
    .eq('id', leadId)
    .single();

  if (fetchError) {
    console.error('[leadScoreUpdater] Fetch lead notes error:', fetchError);
    throw new Error(`Failed to fetch lead notes: ${fetchError.message}`);
  }

  const now = new Date().toISOString();
  const existingNotes = lead?.notes || '';
  const callEntry = [
    '',
    '=== AI Call Notes ===',
    `Call ID: ${callId}`,
    `Date: ${now}`,
    `Summary: ${summary}`,
    'Transcript:',
    transcript,
    '====================',
  ].join('\n');

  const updatedNotes = existingNotes
    ? existingNotes + '\n' + callEntry
    : callEntry;

  const { error: updateError } = await (supabase.from('leads') as any)
    .update({
      notes: updatedNotes,
      updated_at: now,
    })
    .eq('id', leadId);

  if (updateError) {
    console.error('[leadScoreUpdater] Append notes error:', updateError);
    throw new Error(`Failed to append call notes: ${updateError.message}`);
  }
}

// ---------------------------------------------------------------------------
// 3. updateAgentConversionRate — Recalculate agent conversion rate
// ---------------------------------------------------------------------------

/**
 * Recalculate an AI agent's conversion rate based on total calls vs site visits.
 * Queries the ai_call_queue table to count total completed calls and the
 * ai_call_queue table for calls with outcome 'site_visit' or 'converted'.
 * Also checks the site_visits table for additional conversion signals.
 */
export async function updateAgentConversionRate(
  agentId: string,
): Promise<void> {
  const supabase = getDb();

  // Get total completed calls for this agent
  const { data: callStats, error: callError } = await (supabase
    .from('ai_call_queue') as any)
    .select('id, outcome', { count: 'exact' })
    .eq('ai_agent_id', agentId)
    .eq('status', 'completed');

  if (callError) {
    console.error('[leadScoreUpdater] Fetch agent calls error:', callError);
    throw new Error(`Failed to fetch agent call stats: ${callError.message}`);
  }

  const totalCalls = (callStats as unknown[])?.length || 0;
  const completedCalls = (callStats as Array<{ outcome: string | null }>) || [];

  // Count outcomes that indicate conversion
  const convertedCalls = completedCalls.filter(
    (c) => c.outcome === 'site_visit' || c.outcome === 'converted' || c.outcome === 'interested',
  ).length;

  // Get the agent's total connected calls
  const { data: agentData, error: agentError } = await (supabase
    .from('ai_agents') as any)
    .select('total_calls_made, total_calls_connected')
    .eq('id', agentId)
    .single();

  if (agentError) {
    console.error('[leadScoreUpdater] Fetch agent error:', agentError);
    throw new Error(`Failed to fetch agent: ${agentError.message}`);
  }

  const totalCallsMade = agentData?.total_calls_made ?? totalCalls;
  const totalCallsConnected = agentData?.total_calls_connected ?? completedCalls.length;

  // Conversion rate = site_visit or converted outcomes / total completed calls * 100
  const conversionRate =
    totalCallsConnected > 0
      ? Math.round((convertedCalls / totalCallsConnected) * 10000) / 100
      : 0;

  // Update agent stats
  const { error: updateError } = await (supabase.from('ai_agents') as any)
    .update({
      total_calls_made: totalCallsMade,
      total_calls_connected: totalCallsConnected,
      conversion_rate: conversionRate,
      updated_at: new Date().toISOString(),
    })
    .eq('id', agentId);

  if (updateError) {
    console.error('[leadScoreUpdater] Update agent conversion error:', updateError);
    throw new Error(`Failed to update agent conversion rate: ${updateError.message}`);
  }
}
