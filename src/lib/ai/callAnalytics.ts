// ============================================================================
// EstateFlow CRM — AI Call Analytics
// Phase 3 — AI Voice Agent (AGENT-3-4-ANALYTICS-INSIGHTS)
// ============================================================================
//
// Provides analytics functions for the ai_call_analytics table:
//   - logCallAnalytics     — Insert or update daily analytics row
//   - getCallAnalytics     — Aggregated analytics for a period
//   - getAgentAnalytics    — Per-agent analytics for a period
//   - getTopObjections     — Most common objections across calls
//   - getCallTrends        — Daily call volume and outcomes
// ============================================================================

import { createClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Supabase client singleton (lazy init)
// ---------------------------------------------------------------------------

let _supabase: ReturnType<typeof createClient> | null = null;

function getDb() {
  if (_supabase) return _supabase;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      'Supabase not configured. Set SUPABASE_URL and SUPABASE_SERVICE_KEY (or SUPABASE_ANON_KEY).',
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

export interface CallAnalyticsRow {
  id: string;
  tenant_id: string;
  ai_agent_id: string;
  date: string;
  total_calls: number;
  connected_calls: number;
  failed_calls: number;
  avg_duration: number | null;
  avg_sentiment: number | null;
  conversion_rate: number | null;
  top_objections: string[] | null;
  script_performance: Record<string, unknown> | null;
  created_at: string;
}

export interface CallAnalyticsInput {
  totalCalls?: number;
  connectedCalls?: number;
  failedCalls?: number;
  avgDuration?: number | null;
  avgSentiment?: number | null;
  conversionRate?: number | null;
  topObjections?: string[] | null;
  scriptPerformance?: Record<string, unknown> | null;
}

export interface AggregatedAnalytics {
  totalCalls: number;
  totalConnected: number;
  totalFailed: number;
  overallAvgDuration: number | null;
  overallAvgSentiment: number | null;
  overallConversionRate: number | null;
  topObjections: { objection: string; count: number }[];
  days: number;
}

export interface AgentAnalyticsItem {
  agentId: string;
  agentName: string;
  totalCalls: number;
  connectedCalls: number;
  failedCalls: number;
  avgDuration: number | null;
  avgSentiment: number | null;
  conversionRate: number | null;
}

export interface CallTrendDay {
  date: string;
  total_calls: number;
  connected_calls: number;
  failed_calls: number;
  conversion_rate: number | null;
}

// ---------------------------------------------------------------------------
// 1. logCallAnalytics — Insert or update daily analytics row
// ---------------------------------------------------------------------------

/**
 * Insert or update a daily analytics row for a tenant's AI agent.
 * The table has a UNIQUE constraint on (tenant_id, ai_agent_id, date),
 * so we use upsert semantics.
 */
export async function logCallAnalytics(
  tenantId: string,
  aiAgentId: string,
  callData: CallAnalyticsInput,
): Promise<CallAnalyticsRow> {
  const supabase = getDb();
  const today = new Date().toISOString().slice(0, 10);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payload: Record<string, any> = {
    tenant_id: tenantId,
    ai_agent_id: aiAgentId,
    date: today,
  };

  if (callData.totalCalls !== undefined) payload.total_calls = callData.totalCalls;
  if (callData.connectedCalls !== undefined) payload.connected_calls = callData.connectedCalls;
  if (callData.failedCalls !== undefined) payload.failed_calls = callData.failedCalls;
  if (callData.avgDuration !== undefined) payload.avg_duration = callData.avgDuration;
  if (callData.avgSentiment !== undefined) payload.avg_sentiment = callData.avgSentiment;
  if (callData.conversionRate !== undefined) payload.conversion_rate = callData.conversionRate;
  if (callData.topObjections !== undefined) payload.top_objections = callData.topObjections;
  if (callData.scriptPerformance !== undefined) payload.script_performance = callData.scriptPerformance;

  // Upsert: on conflict (tenant_id, ai_agent_id, date), update the row
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from('ai_call_analytics') as any)
  .upsert(payload, {
    onConflict: 'tenant_id, ai_agent_id, date',
    ignoreDuplicates: false,
  })
  .select()
  .single();

  if (error) {
    console.error('[callAnalytics] logCallAnalytics error:', error);
    throw new Error(`Failed to log call analytics: ${error.message}`);
  }

  return data as CallAnalyticsRow;
}

// ---------------------------------------------------------------------------
// 2. getCallAnalytics — Aggregated analytics for a tenant over a date range
// ---------------------------------------------------------------------------

/**
 * Get aggregated analytics for a tenant over a date range.
 * Combines all ai_agent rows within the period.
 */
export async function getCallAnalytics(
  tenantId: string,
  dateFrom: string,
  dateTo: string,
): Promise<AggregatedAnalytics> {
  const supabase = getDb();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from('ai_call_analytics') as any)
    .select('*')
    .eq('tenant_id', tenantId)
    .gte('date', dateFrom)
    .lte('date', dateTo)
    .order('date', { ascending: true });

  if (error) {
    console.error('[callAnalytics] getCallAnalytics error:', error);
    throw new Error(`Failed to get call analytics: ${error.message}`);
  }

  const rows = (data as CallAnalyticsRow[]) || [];

  // Aggregate
  const totalCalls = rows.reduce((sum, r) => sum + r.total_calls, 0);
  const totalConnected = rows.reduce((sum, r) => sum + r.connected_calls, 0);
  const totalFailed = rows.reduce((sum, r) => sum + r.failed_calls, 0);
  const durations = rows.filter((r) => r.avg_duration !== null).map((r) => r.avg_duration as number);
  const sentiments = rows.filter((r) => r.avg_sentiment !== null).map((r) => r.avg_sentiment as number);
  const rates = rows.filter((r) => r.conversion_rate !== null).map((r) => r.conversion_rate as number);

  const overallAvgDuration = durations.length > 0
    ? durations.reduce((a, b) => a + b, 0) / durations.length
    : null;

  const overallAvgSentiment = sentiments.length > 0
    ? sentiments.reduce((a, b) => a + b, 0) / sentiments.length
    : null;

  const overallConversionRate = rates.length > 0
    ? rates.reduce((a, b) => a + b, 0) / rates.length
    : null;

  // Collect all top_objections from all rows
  const objectionMap = new Map<string, number>();
  for (const row of rows) {
    if (row.top_objections) {
      for (const obj of row.top_objections) {
        objectionMap.set(obj, (objectionMap.get(obj) || 0) + 1);
      }
    }
  }

  const topObjections = Array.from(objectionMap.entries())
    .map(([objection, count]) => ({ objection, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    totalCalls,
    totalConnected,
    totalFailed,
    overallAvgDuration,
    overallAvgSentiment,
    overallConversionRate,
    topObjections,
    days: rows.length,
  };
}

// ---------------------------------------------------------------------------
// 3. getAgentAnalytics — Per-agent analytics for a date range
// ---------------------------------------------------------------------------

/**
 * Get analytics broken down per AI agent for a tenant over a date range.
 * Returns one item per agent with aggregated stats.
 */
export async function getAgentAnalytics(
  tenantId: string,
  dateFrom: string,
  dateTo: string,
): Promise<AgentAnalyticsItem[]> {
  const supabase = getDb();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from('ai_call_analytics') as any)
    .select(`
      ai_agent_id,
      total_calls,
      connected_calls,
      failed_calls,
      avg_duration,
      avg_sentiment,
      conversion_rate
    `)
    .eq('tenant_id', tenantId)
    .gte('date', dateFrom)
    .lte('date', dateTo);

  if (error) {
    console.error('[callAnalytics] getAgentAnalytics error:', error);
    throw new Error(`Failed to get agent analytics: ${error.message}`);
  }

  const rows = (data as CallAnalyticsRow[]) || [];

  // Group by agent
  const agentMap = new Map<string, {
    totalCalls: number;
    connectedCalls: number;
    failedCalls: number;
    durations: number[];
    sentiments: number[];
    rates: number[];
  }>();

  for (const row of rows) {
    const key = row.ai_agent_id;
    if (!agentMap.has(key)) {
      agentMap.set(key, {
        totalCalls: 0,
        connectedCalls: 0,
        failedCalls: 0,
        durations: [],
        sentiments: [],
        rates: [],
      });
    }

    const acc = agentMap.get(key)!;
    acc.totalCalls += row.total_calls;
    acc.connectedCalls += row.connected_calls;
    acc.failedCalls += row.failed_calls;
    if (row.avg_duration !== null) acc.durations.push(row.avg_duration);
    if (row.avg_sentiment !== null) acc.sentiments.push(row.avg_sentiment);
    if (row.conversion_rate !== null) acc.rates.push(row.conversion_rate);
  }

  // Convert to array and fetch agent names
  const results: AgentAnalyticsItem[] = [];

  const agentEntries = Array.from(agentMap.entries());
  for (const [agentId, acc] of agentEntries) {
    const avgD = acc.durations.length > 0
      ? acc.durations.reduce((a, b) => a + b, 0) / acc.durations.length
      : null;
    const avgS = acc.sentiments.length > 0
      ? acc.sentiments.reduce((a, b) => a + b, 0) / acc.sentiments.length
      : null;
    const avgR = acc.rates.length > 0
      ? acc.rates.reduce((a, b) => a + b, 0) / acc.rates.length
      : null;

    results.push({
      agentId,
      agentName: '', // Will be filled in below
      totalCalls: acc.totalCalls,
      connectedCalls: acc.connectedCalls,
      failedCalls: acc.failedCalls,
      avgDuration: Math.round((avgD ?? 0) * 100) / 100,
      avgSentiment: avgS !== null ? Math.round(avgS * 100) / 100 : null,
      conversionRate: avgR !== null ? Math.round(avgR * 100) / 100 : null,
    });
  }

  // Fetch agent names if we have agents
  if (results.length > 0) {
    const agentIds = results.map((r) => r.agentId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: agentData, error: agentErr } = await (supabase
      .from('ai_agents') as any)
      .select('id, name')
      .in('id', agentIds);

    if (!agentErr && agentData) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nameMap = new Map((agentData as any[]).map((a: any) => [a.id, a.name]));
      for (const item of results) {
        item.agentName = nameMap.get(item.agentId) || 'Unknown Agent';
      }
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// 4. getTopObjections — Most common objections across all calls in period
// ---------------------------------------------------------------------------

/**
 * Get the most common objections raised during calls for a tenant.
 * Scans the ai_call_analytics table for the given date range and returns
 * a ranked list of objections with counts.
 */
export async function getTopObjections(
  tenantId: string,
  dateFrom: string,
  dateTo: string,
): Promise<{ objection: string; count: number }[]> {
  const supabase = getDb();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from('ai_call_analytics') as any)
    .select('top_objections')
    .eq('tenant_id', tenantId)
    .gte('date', dateFrom)
    .lte('date', dateTo);

  if (error) {
    console.error('[callAnalytics] getTopObjections error:', error);
    throw new Error(`Failed to get top objections: ${error.message}`);
  }

  const rows = (data as Pick<CallAnalyticsRow, 'top_objections'>[]) || [];

  // Aggregate objections across all rows
  const objectionMap = new Map<string, number>();
  for (const row of rows) {
    if (row.top_objections) {
      for (const obj of row.top_objections) {
        objectionMap.set(obj, (objectionMap.get(obj) || 0) + 1);
      }
    }
  }

  return Array.from(objectionMap.entries())
    .map(([objection, count]) => ({ objection, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);
}

// ---------------------------------------------------------------------------
// 5. getCallTrends — Daily call volume and outcomes for past N days
// ---------------------------------------------------------------------------

/**
 * Get daily call volume, connected calls, failed calls, and conversion rate
 * for the past N days for a tenant.
 */
export async function getCallTrends(
  tenantId: string,
  days: number = 30,
): Promise<CallTrendDay[]> {
  const supabase = getDb();

  const dateTo = new Date().toISOString().slice(0, 10);
  const dateFromDate = new Date();
  dateFromDate.setDate(dateFromDate.getDate() - days);
  const dateFrom = dateFromDate.toISOString().slice(0, 10);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from('ai_call_analytics') as any)
    .select('date, total_calls, connected_calls, failed_calls, conversion_rate')
    .eq('tenant_id', tenantId)
    .gte('date', dateFrom)
    .lte('date', dateTo)
    .order('date', { ascending: true });

  if (error) {
    console.error('[callAnalytics] getCallTrends error:', error);
    throw new Error(`Failed to get call trends: ${error.message}`);
  }

  return (data as CallTrendDay[]) || [];
}
