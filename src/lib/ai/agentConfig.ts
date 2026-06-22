// ============================================================================
// EstateFlow CRM — AI Agent Configuration CRUD
// Phase 3: AI Voice Agent — Agent Configuration System
// ============================================================================

import { createClient } from '@supabase/supabase-js';
import type {
  ClientAIAgent,
  ClientAIAgentStats,
  CreateAgentInput,
  UpdateAgentInput,
  AgentWorkload,
} from '@/types/ai';

// ---------------------------------------------------------------------------
// Supabase client helper (lazy singleton)
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
// Helpers: map DB row ↔ ClientAIAgent interface
// ---------------------------------------------------------------------------

interface AiAgentRow {
  id: string;
  tenant_id: string;
  name: string;
  voice: string | null;
  language: string | null;
  purpose: string | null;
  script_templates: Record<string, string> | null;
  behavior_config: Record<string, unknown> | null;
  max_concurrent_calls: number;
  current_calls: number;
  total_calls_made: number;
  total_calls_connected: number;
  avg_call_duration: number | null;
  conversion_rate: number | null;
  status: string;
  created_at: string;
  updated_at: string;
}

function rowToAgent(row: AiAgentRow): ClientAIAgent {
  const scriptTemplates = row.script_templates;
  const behaviorConfig = row.behavior_config;

  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    voice: row.voice || 'default',
    language: row.language || 'en',
    greeting: row.purpose || '',
    scriptTemplates: {
      firstContact: scriptTemplates?.firstContact || '',
      followUp: scriptTemplates?.followUp || '',
      siteVisitConfirm: scriptTemplates?.siteVisitConfirm || '',
      postVisit: scriptTemplates?.postVisit || '',
      negotiation: scriptTemplates?.negotiation || '',
      reEngagement: scriptTemplates?.reEngagement || '',
    },
    behavior: {
      callDelayMinutes: (behaviorConfig?.callDelayMinutes as number) || 0,
      maxCallDuration: (behaviorConfig?.maxCallDuration as number) || 300,
      maxRetries: (behaviorConfig?.maxRetries as number) || 3,
      transferToHuman: {
        budgetThreshold:
          ((behaviorConfig?.transferToHuman as Record<string, unknown>)?.budgetThreshold as number) || 0,
        angerDetected:
          ((behaviorConfig?.transferToHuman as Record<string, unknown>)?.angerDetected as boolean) || false,
        complexQuestion:
          ((behaviorConfig?.transferToHuman as Record<string, unknown>)?.complexQuestion as boolean) || false,
      },
      offers: {
        maxDiscount:
          ((behaviorConfig?.offers as Record<string, unknown>)?.maxDiscount as number) || 0,
        canOfferParking:
          ((behaviorConfig?.offers as Record<string, unknown>)?.canOfferParking as boolean) || false,
        canOfferFurniture:
          ((behaviorConfig?.offers as Record<string, unknown>)?.canOfferFurniture as boolean) || false,
        canOfferMaintenance:
          ((behaviorConfig?.offers as Record<string, unknown>)?.canOfferMaintenance as boolean) || false,
      },
    },
    status: (row.status as ClientAIAgent['status']) || 'inactive',
    currentCalls: row.current_calls,
    totalCalls: row.total_calls_made,
    stats: {
      currentCalls: row.current_calls,
      totalCallsMade: row.total_calls_made,
      totalCallsConnected: row.total_calls_connected,
      avgCallDuration: row.avg_call_duration,
      conversionRate: row.conversion_rate,
    },
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// 1. createAgent — Create a new AI agent for a tenant
// ---------------------------------------------------------------------------

export async function createAgent(
  tenantId: string,
  config: CreateAgentInput,
): Promise<ClientAIAgent> {
  const supabase = getDb();

  const { data, error } = await supabase
    .from('ai_agents')
    .insert({
      tenant_id: tenantId,
      name: config.name,
      voice: config.voice || 'default',
      language: config.language || 'en',
      purpose: config.greeting || config.purpose || null,
      script_templates: (config.scriptTemplates as unknown as Record<string, unknown>) || null,
      behavior_config: (config.behavior as unknown as Record<string, unknown>) || null,
      max_concurrent_calls: config.maxConcurrentCalls ?? 5,
      status: 'active',
    } as never)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create AI agent: ${error.message}`);
  }

  return rowToAgent(data as unknown as AiAgentRow);
}

// ---------------------------------------------------------------------------
// 2. updateAgent — Update an existing agent config
// ---------------------------------------------------------------------------

export async function updateAgent(
  agentId: string,
  config: UpdateAgentInput,
): Promise<ClientAIAgent> {
  const supabase = getDb();

  const updateData: Record<string, unknown> = {};

  if (config.name !== undefined) updateData.name = config.name;
  if (config.voice !== undefined) updateData.voice = config.voice;
  if (config.language !== undefined) updateData.language = config.language;
  if (config.greeting !== undefined) updateData.purpose = config.greeting;
  if (config.purpose !== undefined) updateData.purpose = config.purpose;
  if (config.status !== undefined) updateData.status = config.status;
  if (config.maxConcurrentCalls !== undefined) updateData.max_concurrent_calls = config.maxConcurrentCalls;

  if (config.scriptTemplates !== undefined) {
    const existing = await getAgent(agentId);
    if (existing) {
      const mergedScripts = {
        ...existing.scriptTemplates,
        ...config.scriptTemplates,
      };
      updateData.script_templates = mergedScripts;
    } else {
      updateData.script_templates = config.scriptTemplates;
    }
  }

  if (config.behavior !== undefined) {
    const existing = await getAgent(agentId);
    if (existing) {
      const mergedBehavior = {
        ...existing.behavior,
        ...config.behavior,
        transferToHuman: {
          ...existing.behavior.transferToHuman,
          ...(config.behavior.transferToHuman || {}),
        },
        offers: {
          ...existing.behavior.offers,
          ...(config.behavior.offers || {}),
        },
      };
      updateData.behavior_config = mergedBehavior;
    } else {
      updateData.behavior_config = config.behavior;
    }
  }

  const { data, error } = await supabase
    .from('ai_agents')
    .update(updateData as never)
    .eq('id', agentId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update AI agent: ${error.message}`);
  }

  return rowToAgent(data as unknown as AiAgentRow);
}

// ---------------------------------------------------------------------------
// 3. deleteAgent — Soft-deactivate an agent by setting status to 'inactive'
// ---------------------------------------------------------------------------

export async function deleteAgent(agentId: string): Promise<void> {
  const supabase = getDb();

  const { error } = await supabase
    .from('ai_agents')
    .update({ status: 'inactive' } as never)
    .eq('id', agentId);

  if (error) {
    throw new Error(`Failed to deactivate AI agent: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// 4. getAgent — Get a single agent by ID
// ---------------------------------------------------------------------------

export async function getAgent(agentId: string): Promise<ClientAIAgent | null> {
  const supabase = getDb();

  const { data, error } = await supabase
    .from('ai_agents')
    .select('*')
    .eq('id', agentId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    throw new Error(`Failed to get AI agent: ${error.message}`);
  }

  return rowToAgent(data as unknown as AiAgentRow);
}

// ---------------------------------------------------------------------------
// 5. getTenantAgents — List all agents for a tenant
// ---------------------------------------------------------------------------

export async function getTenantAgents(tenantId: string): Promise<ClientAIAgent[]> {
  const supabase = getDb();

  const { data, error } = await supabase
    .from('ai_agents')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to list tenant agents: ${error.message}`);
  }

  return (data as unknown as AiAgentRow[]).map(rowToAgent);
}

// ---------------------------------------------------------------------------
// 6. getAvailableAgents — Only active agents for a tenant
// ---------------------------------------------------------------------------

export async function getAvailableAgents(tenantId: string): Promise<ClientAIAgent[]> {
  const supabase = getDb();

  const { data, error } = await supabase
    .from('ai_agents')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to list available agents: ${error.message}`);
  }

  return (data as unknown as AiAgentRow[]).map(rowToAgent);
}

// ---------------------------------------------------------------------------
// 7. updateAgentStats — Update call counts and conversion rate for an agent
// ---------------------------------------------------------------------------

export async function updateAgentStats(
  agentId: string,
  stats: Partial<ClientAIAgentStats>,
): Promise<void> {
  const supabase = getDb();

  const updateData: Record<string, unknown> = {};

  if (stats.currentCalls !== undefined) updateData.current_calls = stats.currentCalls;
  if (stats.totalCallsMade !== undefined) updateData.total_calls_made = stats.totalCallsMade;
  if (stats.totalCallsConnected !== undefined) updateData.total_calls_connected = stats.totalCallsConnected;
  if (stats.avgCallDuration !== undefined) updateData.avg_call_duration = stats.avgCallDuration;
  if (stats.conversionRate !== undefined) updateData.conversion_rate = stats.conversionRate;

  const { error } = await supabase
    .from('ai_agents')
    .update(updateData as never)
    .eq('id', agentId);

  if (error) {
    throw new Error(`Failed to update agent stats: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// 8. getAgentWorkload — Current vs max concurrent calls for an agent
// ---------------------------------------------------------------------------

export async function getAgentWorkload(agentId: string): Promise<AgentWorkload> {
  const supabase = getDb();

  const { data, error } = await supabase
    .from('ai_agents')
    .select('id, current_calls, max_concurrent_calls, status')
    .eq('id', agentId)
    .single();

  if (error) {
    throw new Error(`Failed to get agent workload: ${error.message}`);
  }

  const row = data as { id: string; current_calls: number; max_concurrent_calls: number; status: string };

  return {
    agentId: row.id,
    currentCalls: row.current_calls,
    maxConcurrentCalls: row.max_concurrent_calls,
    availableSlots: Math.max(0, row.max_concurrent_calls - row.current_calls),
    utilizationPercent:
      row.max_concurrent_calls > 0
        ? Math.round((row.current_calls / row.max_concurrent_calls) * 100)
        : 0,
    status: row.status,
  };
}
