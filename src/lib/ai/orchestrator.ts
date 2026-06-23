// ============================================================================
// EstateFlow CRM — AI Voice Orchestrator
// Phase 3 — AI Voice Agent
// ============================================================================
//
// AIVoiceOrchestrator class that coordinates the AI call pipeline:
//   1. processNewLead       — Called when a new lead is created
//   2. shouldAICall         — Decides if AI should handle the lead
//   3. selectAIAgent        — Picks the best AI agent for the lead
//   4. buildScript          — Generates the call script
//   5. scheduleCall         — Queues the call with a delay
//   6. processFollowUp      — Schedules follow-up based on outcome
//   7. processReEngagement  — Re-engages lost/stale leads
//   8. transferToHuman      — Flags a lead for human attention
// ============================================================================

import { createClient } from '@supabase/supabase-js';
import { queueCall } from './callQueue';
import {
  buildFirstContactScript,
  buildFollowUpScript,
  buildReEngagementScript,
} from './scriptBuilder';
import { AI_AGENT_PURPOSES } from '@/lib/constants';

// ---------------------------------------------------------------------------
// Supabase client (lazy init)
// ---------------------------------------------------------------------------

let _supabase: ReturnType<typeof createClient> | null = null;

function getDb() {
  if (_supabase) return _supabase;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error('Supabase not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY.');
  }

  _supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return _supabase;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LeadRecord {
  id: string;
  tenant_id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  source: string | null;
  status: string;
  ai_score: number | null;
  budget_min: number | null;
  budget_max: number | null;
  preferred_location: string | null;
  property_type: string | null;
  notes: string | null;
  assigned_agent_id: string | null;
  is_duplicate?: boolean;
  created_at: string;
  updated_at: string;
}

export interface TenantRecord {
  id: string;
  name: string;
  slug: string;
  plan?: string;
  ai_voice_enabled: boolean;
  feature_flags: Record<string, unknown>;
  whatsapp_number: string | null;
  email_sender_name: string | null;
  logo_url: string | null;
}

export interface AIAgentRecord {
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
  status: string;
}

export interface ScheduleCallParams {
  tenantId: string;
  leadId: string;
  aiAgentId: string;
  phone: string;
  script: string;
  voice: string | null;
  language: string;
  callDelayMinutes: number;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// AIVoiceOrchestrator
// ============================================================================

export class AIVoiceOrchestrator {
  // -------------------------------------------------------------------------
  // processNewLead — Full pipeline for a newly created lead
  // -------------------------------------------------------------------------

  /**
   * Process a new lead through the AI call pipeline:
   *   1. Check if AI should handle (shouldAICall)
   *   2. Select the best AI agent (selectAIAgent)
   *   3. Build the call script (buildScript)
   *   4. Schedule the call (scheduleCall)
   *
   * @param leadId - UUID of the newly created lead
   * @returns The queued call record, or null if AI shouldn't handle
   */
  async processNewLead(leadId: string): Promise<{ callId: string } | null> {
    const supabase = getDb();

    // ── Fetch lead with tenant info ────────────────────────────────────────
    const { data: lead, error: leadErr } = await (supabase.from('leads') as any)
      .select('*')
      .eq('id', leadId)
      .single();

    if (leadErr || !lead) {
      console.error('[orchestrator] processNewLead: lead not found', leadId, leadErr);
      return null;
    }

    const leadRecord = lead as LeadRecord;

    // ── Fetch tenant ───────────────────────────────────────────────────────
    const { data: tenant, error: tenantErr } = await (supabase.from('tenants') as any)
      .select('*')
      .eq('id', leadRecord.tenant_id)
      .single();

    if (tenantErr || !tenant) {
      console.error('[orchestrator] processNewLead: tenant not found', leadRecord.tenant_id, tenantErr);
      return null;
    }

    const tenantRecord = tenant as TenantRecord;

    // ── Step 1: Should AI handle this lead? ────────────────────────────────
    if (!this.shouldAICall(leadRecord, tenantRecord)) {
      console.log('[orchestrator] processNewLead: AI call skipped for lead', leadId);
      return null;
    }

    // ── Step 2: Select best AI agent ───────────────────────────────────────
    const agent = await this.selectAIAgent(leadRecord, tenantRecord);
    if (!agent) {
      console.log('[orchestrator] processNewLead: no suitable AI agent found for lead', leadId);
      return null;
    }

    // ── Step 3: Build script ───────────────────────────────────────────────
    const script = this.buildScript(leadRecord, agent, 'firstContact');

    // ── Step 4: Schedule the call ─────────────────────────────────────────
    const callDelayMinutes = this.getCallDelay(tenantRecord);
    const call = await this.scheduleCall({
      tenantId: leadRecord.tenant_id,
      leadId: leadRecord.id,
      aiAgentId: agent.id,
      phone: leadRecord.phone || '',
      script,
      voice: agent.voice,
      language: agent.language || 'en',
      callDelayMinutes,
      metadata: { source: 'new_lead' },
    });

    return { callId: call.id };
  }

  // -------------------------------------------------------------------------
  // shouldAICall — Decide if AI should handle the lead
  // -------------------------------------------------------------------------

  /**
   * Determine whether the AI voice agent should handle this lead.
   *
   * Returns false if:
   *   - AI voice is disabled for the tenant
   *   - Lead has no phone number
   *   - Lead is a hot lead (ai_score >= 85)
   *   - Lead is VIP (budget_max > 2 Crore)
   *   - Lead is in won/lost/archived status
   *   - Lead is a duplicate
   */
  shouldAICall(lead: LeadRecord, tenant: TenantRecord): boolean {
    // Tenant must have AI voice enabled
    if (!tenant.ai_voice_enabled) {
      return false;
    }

    // Must have a phone number to call
    if (!lead.phone) {
      return false;
    }

    // Don't call closed_won/closed_lost leads
    if (lead.status === 'closed_won' || lead.status === 'closed_lost' || lead.status === 'closed_lost') {
      return false;
    }

    // Don't call duplicates
    if (lead.is_duplicate) {
      return false;
    }

    // Hot leads (score >= 85) go to human agents immediately
    if (lead.ai_score != null && lead.ai_score >= 85) {
      return false;
    }

    // VIP leads (budget > 2 Cr) — human handling for high-value prospects
    if (lead.budget_max != null && lead.budget_max > 20_000_000) {
      return false;
    }

    return true;
  }

  // -------------------------------------------------------------------------
  // selectAIAgent — Pick the best AI agent for this lead
  // -------------------------------------------------------------------------

  /**
   * Select the most suitable AI agent for a lead.
   *
   * Matching criteria (in priority order):
   *   1. Active agents only
   *   2. Language match (prefer agent matching lead's inferred language)
   *   3. Purpose match (prefer agents configured for lead_qualification)
   *   4. Least busy (lowest current_calls / max_concurrent_calls ratio)
   *
   * @param lead   - Lead record
   * @param tenant - Tenant record
   * @returns The best AI agent, or null if none available
   */
  async selectAIAgent(
    lead: LeadRecord,
    tenant: TenantRecord,
  ): Promise<AIAgentRecord | null> {
    const supabase = getDb();

    // Fetch all active AI agents for this tenant
    const { data: agents, error } = await (supabase.from('ai_agents') as any)
      .select('*')
      .eq('tenant_id', tenant.id)
      .eq('status', 'active');

    if (error || !agents || agents.length === 0) {
      console.error('[orchestrator] selectAIAgent: no active agents', error);
      return null;
    }

    const agentList = agents as AIAgentRecord[];

    // Score each agent
    let bestAgent: AIAgentRecord | null = null;
    let bestScore = -1;

    for (const agent of agentList) {
      let score = 0;

      // Language match (assume English for now, could be inferred from phone/region)
      const leadLang = 'en';
      if (agent.language === leadLang) {
        score += 50;
      }

      // Purpose match — prefer lead qualification for new leads
      if (agent.purpose === AI_AGENT_PURPOSES.LEAD_QUALIFICATION) {
        score += 30;
      }

      // Availability score — higher is better (more free capacity)
      const maxCalls = agent.max_concurrent_calls || 5;
      const currentCalls = agent.current_calls || 0;
      const availabilityRatio = 1 - currentCalls / maxCalls;
      score += availabilityRatio * 20;

      if (score > bestScore) {
        bestScore = score;
        bestAgent = agent;
      }
    }

    return bestAgent;
  }

  // -------------------------------------------------------------------------
  // buildScript — Generate call script from template
  // -------------------------------------------------------------------------

  /**
   * Build a call script for a lead using the selected AI agent's template.
   *
   * @param lead      - Lead record
   * @param agent     - Selected AI agent
   * @param scenario  - Scenario name ('firstContact', 'followUp', 'reEngagement', etc.)
   * @returns The compiled script string
   */
  buildScript(
    lead: LeadRecord,
    agent: AIAgentRecord,
    scenario: string = 'firstContact',
  ): string {
    // Extract custom template from agent config if available
    const agentTemplates = agent.script_templates as Record<string, string> | null;
    const customTemplate = agentTemplates?.[scenario] ?? undefined;

    switch (scenario) {
      case 'firstContact':
        return buildFirstContactScript(lead, agent, customTemplate);
      case 'followUp':
        return buildFollowUpScript(lead, agent, 3, customTemplate);
      case 'reEngagement':
        return buildReEngagementScript(lead, agent, 3, customTemplate);
      default:
        return buildFirstContactScript(lead, agent, customTemplate);
    }
  }

  // -------------------------------------------------------------------------
  // scheduleCall — Queue a call with delay
  // -------------------------------------------------------------------------

  /**
   * Queue a call in the ai_call_queue with a scheduled time.
   *
   * @param params - Schedule parameters
   * @returns The created call queue row
   */
  async scheduleCall(params: ScheduleCallParams) {
    const scheduledAt = new Date(Date.now() + params.callDelayMinutes * 60_000);

    return queueCall({
      tenantId: params.tenantId,
      leadId: params.leadId,
      aiAgentId: params.aiAgentId,
      phone: params.phone,
      script: params.script,
      voice: params.voice,
      language: params.language,
      scheduledAt,
      metadata: params.metadata,
    });
  }

  // -------------------------------------------------------------------------
  // processFollowUp — Schedule follow-up based on last call outcome
  // -------------------------------------------------------------------------

  /**
   * Schedule a follow-up call for a lead based on prior call outcome.
   *
   * Follow-up delays:
   *   - 'interested':   1 day
   *   - 'callback':     3 days
   *   - 'not_interested': 7 days (one more attempt)
   *   - otherwise:      2 days
   *
   * @param leadId - UUID of the lead
   * @returns The queued call record, or null if no follow-up needed
   */
  async processFollowUp(leadId: string): Promise<{ callId: string } | null> {
    const supabase = getDb();

    // Fetch lead
    const { data: lead, error: leadErr } = await (supabase.from('leads') as any)
      .select('*')
      .eq('id', leadId)
      .single();

    if (leadErr || !lead) return null;
    const leadRecord = lead as LeadRecord;

    // Fetch last call for this lead
    const { data: lastCall } = await (supabase.from('ai_call_queue') as any)
      .select('*')
      .eq('lead_id', leadId)
      .eq('tenant_id', leadRecord.tenant_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!lastCall) return null;
    const lastCallRecord = lastCall as { outcome: string | null; ai_agent_id: string | null };

    // Determine delay based on outcome
    let delayDays = 2;
    switch (lastCallRecord.outcome) {
      case 'interested':
        delayDays = 1;
        break;
      case 'callback':
        delayDays = 3;
        break;
      case 'not_interested':
        delayDays = 7;
        break;
      default:
        delayDays = 2;
    }

    // Build follow-up script
    const { data: tenant } = await (supabase.from('tenants') as any)
      .select('*')
      .eq('id', leadRecord.tenant_id)
      .single();

    const tenantRecord = tenant as TenantRecord | null;
    if (!tenantRecord) return null;

    const agent = await this.selectAIAgent(leadRecord, tenantRecord);
    if (!agent) return null;

    const script = this.buildScript(leadRecord, agent, 'followUp');

    const call = await this.scheduleCall({
      tenantId: leadRecord.tenant_id,
      leadId: leadRecord.id,
      aiAgentId: agent.id,
      phone: leadRecord.phone || '',
      script,
      voice: agent.voice,
      language: agent.language || 'en',
      callDelayMinutes: delayDays * 24 * 60,
      metadata: { source: 'follow_up', previous_outcome: lastCallRecord.outcome },
    });

    return { callId: call.id };
  }

  // -------------------------------------------------------------------------
  // processReEngagement — Re-engage lost or stale leads
  // -------------------------------------------------------------------------

  /**
   * Schedule a re-engagement call for leads that have been lost or gone stale.
   *
   * @param leadId - UUID of the lead
   * @returns The queued call record, or null
   */
  async processReEngagement(leadId: string): Promise<{ callId: string } | null> {
    const supabase = getDb();

    const { data: lead, error: leadErr } = await (supabase.from('leads') as any)
      .select('*')
      .eq('id', leadId)
      .single();

    if (leadErr || !lead) return null;
    const leadRecord = lead as LeadRecord;

    // Only re-engage lost or stale leads
    if (leadRecord.status !== 'closed_lost' && leadRecord.status !== 'closed_lost') {
      const daysSinceUpdate = Math.floor(
        (Date.now() - new Date(leadRecord.updated_at).getTime()) / 86_400_000,
      );
      if (daysSinceUpdate < 30) return null; // Not stale enough
    }

    const { data: tenant } = await (supabase.from('tenants') as any)
      .select('*')
      .eq('id', leadRecord.tenant_id)
      .single();

    const tenantRecord = tenant as TenantRecord | null;
    if (!tenantRecord) return null;

    const agent = await this.selectAIAgent(leadRecord, tenantRecord);
    if (!agent) return null;

    const script = this.buildScript(leadRecord, agent, 'reEngagement');

    const call = await this.scheduleCall({
      tenantId: leadRecord.tenant_id,
      leadId: leadRecord.id,
      aiAgentId: agent.id,
      phone: leadRecord.phone || '',
      script,
      voice: agent.voice,
      language: agent.language || 'en',
      callDelayMinutes: 60, // 1 hour from now
      metadata: { source: 're_engagement' },
    });

    return { callId: call.id };
  }

  // -------------------------------------------------------------------------
  // transferToHuman — Flag lead for human attention
  // -------------------------------------------------------------------------

  /**
   * Transfer a lead to a human agent by creating a task for it.
   *
   * @param leadId - UUID of the lead
   * @param reason - Reason for the transfer
   */
  async transferToHuman(leadId: string, reason: string): Promise<void> {
    const supabase = getDb();

    // Fetch lead to get tenant id
    const { data: lead, error: leadErr } = await (supabase.from('leads') as any)
      .select('id, tenant_id, full_name')
      .eq('id', leadId)
      .single();

    if (leadErr || !lead) {
      console.error('[orchestrator] transferToHuman: lead not found', leadId);
      return;
    }

    // Create a high-priority task for the lead
    const { error } = await (supabase.from('tasks') as any).insert({
      tenant_id: lead.tenant_id,
      lead_id: leadId,
      title: `Human attention needed for ${lead.full_name}`,
      description: `AI has flagged this lead for human intervention. Reason: ${reason}`,
      priority: 'high',
      status: 'pending',
      created_at: new Date().toISOString(),
    });

    if (error) {
      console.error('[orchestrator] transferToHuman: task creation error:', error);
    }
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /**
   * Determine the call delay based on tenant plan and configuration.
   * Higher-tier plans can set shorter delays or immediate calls.
   */
  private getCallDelay(tenant: TenantRecord): number {
    const featureFlags = tenant.feature_flags as Record<string, unknown> | null;

    // Check if tenant has a custom call delay configured
    if (featureFlags && typeof featureFlags.call_delay_minutes === 'number') {
      return featureFlags.call_delay_minutes as number;
    }

    // Default delays by billing plan (not tenant slug)
    switch (tenant.plan) {
      case 'enterprise':
        return 1; // 1 minute
      case 'professional':
        return 5; // 5 minutes
      case 'starter':
        return 15; // 15 minutes
      default:
        return 30; // 30 minutes for free tier
    }
  }
}
