// ============================================================================
// EstateFlow CRM — Commission Tracking Queries (Data Access Layer)
// Phase 6: Supporting Modules — Agent-6-2-Deals-Commissions
// ============================================================================

import { createClient } from '@supabase/supabase-js';
import { getDealById } from '@/lib/deals/queries';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CommissionConfig {
  id?: string;
  tenant_id: string;
  agent_id: string;
  name: string;
  percentage: number | null;
  fixed_amount: number | null;
  deal_type?: string | null;
  min_value?: number | null;
  max_value?: number | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface CommissionRule {
  id?: string;
  tenant_id: string;
  name: string;
  rule_type: 'percentage' | 'fixed' | 'tiered';
  config: CommissionRuleConfig;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface CommissionRuleConfig {
  default_percentage?: number;
  default_fixed?: number;
  tiers?: CommissionTier[];
  agent_overrides?: Record<string, { percentage?: number; fixed_amount?: number }>;
}

export interface CommissionTier {
  min_value: number;
  max_value: number | null;
  percentage: number;
  fixed_amount: number | null;
}

export interface CommissionCalculation {
  deal_id: string;
  deal_value: number;
  agent_id: string;
  commission_amount: number;
  percentage: number;
  fixed_amount: number | null;
  rule_name: string | null;
}

export interface AgentCommission {
  id?: string;
  deal_id: string;
  agent_id: string;
  tenant_id: string;
  deal_value: number;
  commission_amount: number;
  percentage: number;
  status: 'pending' | 'paid' | 'cancelled';
  paid_at: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface CommissionSummary {
  agent_id: string;
  agent_name: string;
  total_deals: number;
  total_commission: number;
  pending: number;
  paid: number;
}

// ---------------------------------------------------------------------------
// Supabase client (lazy init)
// ---------------------------------------------------------------------------

let supabaseClient: ReturnType<typeof createClient> | null = null;

function getSupabase() {
  if (supabaseClient) return supabaseClient;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      'Supabase not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY.',
    );
  }

  supabaseClient = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return supabaseClient;
}

// ---------------------------------------------------------------------------
// 1. calculateCommission — Auto-calculate based on deal value + agent config
// ---------------------------------------------------------------------------

/**
 * Calculate commission for a deal based on the agent's commission config
 * and any tenant-level commission rules.
 *
 * Flow:
 *   1. Fetch the deal to get value and assigned agent
 *   2. Look up agent-specific commission config
 *   3. Apply tenant-level commission rules (tiered logic)
 *   4. Return calculated amount
 */
export async function calculateCommission(
  dealId: string,
): Promise<CommissionCalculation> {
  const supabase = getSupabase();

  // Fetch deal with assigned agent
  const deal = await getDealById(dealId);
  if (!deal) {
    throw new Error(`Deal not found: ${dealId}`);
  }
  if (!deal.assigned_to) {
    throw new Error(`Deal ${dealId} has no assigned agent`);
  }

  const agentId = deal.assigned_to;
  const dealValue = Number(deal.value) || 0;
  const tenantId = deal.tenant_id;

  // Look up agent-specific commission config
  const { data: agentConfigs, error: configErr } = await (supabase
    .from('commission_configs') as any)
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('agent_id', agentId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1);

  if (configErr) {
    console.warn('[commissions/queries] Error fetching agent config:', configErr);
  }

  // Look up tenant-level commission rule
  const { data: tenantRules, error: rulesErr } = await (supabase
    .from('commission_rules') as any)
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1);

  if (rulesErr) {
    console.warn('[commissions/queries] Error fetching tenant rules:', rulesErr);
  }

  // Determine commission amount
  let percentage = 0;
  let fixedAmount: number | null = null;
  let ruleName: string | null = null;

  // Priority: agent config > tenant rule > default (0)
  const agentConfig = agentConfigs?.[0] as CommissionConfig | undefined;

  if (agentConfig) {
    ruleName = agentConfig.name || 'Agent Commission';
    if (agentConfig.percentage != null) {
      percentage = Number(agentConfig.percentage);
    }
    if (agentConfig.fixed_amount != null) {
      fixedAmount = Number(agentConfig.fixed_amount);
    }
  } else if (tenantRules?.[0]) {
    const rule = tenantRules[0] as CommissionRule;
    ruleName = rule.name;
    const cfg = rule.config;

    if (rule.rule_type === 'percentage' && cfg.default_percentage) {
      percentage = cfg.default_percentage;
    } else if (rule.rule_type === 'fixed' && cfg.default_fixed) {
      fixedAmount = cfg.default_fixed;
    } else if (rule.rule_type === 'tiered' && cfg.tiers) {
      // Find matching tier by deal value
      const sortedTiers = [...cfg.tiers].sort((a, b) => a.min_value - b.min_value);
      const matchingTier = sortedTiers.find(
        (t) => dealValue >= t.min_value && (t.max_value === null || dealValue <= t.max_value),
      );
      if (matchingTier) {
        percentage = matchingTier.percentage;
        fixedAmount = matchingTier.fixed_amount;
      }
    }

    // Check for agent-specific override
    if (cfg.agent_overrides?.[agentId]) {
      const override = cfg.agent_overrides[agentId];
      if (override.percentage != null) percentage = override.percentage;
      if (override.fixed_amount != null) fixedAmount = override.fixed_amount;
    }
  }

  // Calculate commission — when both percentage and fixed_amount are set, use the larger
  let commissionAmount = 0;
  const percentageAmount = (dealValue * percentage) / 100;
  if (fixedAmount != null && percentage > 0) {
    commissionAmount = Math.max(fixedAmount, percentageAmount);
  } else if (fixedAmount != null) {
    commissionAmount = fixedAmount;
  } else {
    commissionAmount = percentageAmount;
  }

  return {
    deal_id: dealId,
    deal_value: dealValue,
    agent_id: agentId,
    commission_amount: Math.round(commissionAmount * 100) / 100,
    percentage,
    fixed_amount: fixedAmount,
    rule_name: ruleName,
  };
}

// ---------------------------------------------------------------------------
// 2. getCommission — Agent's commission for a date range
// ---------------------------------------------------------------------------

/**
 * Get commission records for a specific agent within a date range.
 */
export async function getCommission(
  agentId: string,
  dateFrom?: string,
  dateTo?: string,
): Promise<AgentCommission[]> {
  const supabase = getSupabase();

  let query = (supabase.from('commissions') as any)
    .select('*')
    .eq('agent_id', agentId)
    .order('created_at', { ascending: false });

  if (dateFrom) {
    query = query.gte('created_at', dateFrom);
  }
  if (dateTo) {
    query = query.lte('created_at', dateTo);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[commissions/queries] getCommission error:', error);
    throw new Error(`Failed to fetch commission records: ${error.message}`);
  }

  return (data ?? []) as AgentCommission[];
}

// ---------------------------------------------------------------------------
// 3. getTeamCommissions — All commissions for a tenant in a given month
// ---------------------------------------------------------------------------

/**
 * Retrieve all commission records for a tenant within a specific month.
 * Includes agent name via users join.
 */
export async function getTeamCommissions(
  tenantId: string,
  month: string, // ISO month string, e.g. "2026-06"
): Promise<CommissionSummary[]> {
  const supabase = getSupabase();

  // Calculate date range from month string
  const [yearStr, monthStr] = month.split('-');
  const year = parseInt(yearStr!, 10);
  const m = parseInt(monthStr!, 10);
  const startOfMonth = new Date(year, m - 1, 1).toISOString();
  const endOfMonth = new Date(year, m, 0, 23, 59, 59).toISOString();

  const { data, error } = await (supabase
    .from('commissions') as any)
    .select(
      `
      *,
      agent:agent_id ( id, full_name )
    `,
    )
    .eq('tenant_id', tenantId)
    .gte('created_at', startOfMonth)
    .lte('created_at', endOfMonth)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[commissions/queries] getTeamCommissions error:', error);
    throw new Error(`Failed to fetch team commissions: ${error.message}`);
  }

  const records = (data ?? []) as Array<AgentCommission & { agent: { id: string; full_name: string } }>;

  // Aggregate by agent
  const agentMap = new Map<string, CommissionSummary>();

  for (const rec of records) {
    const agentId = rec.agent_id;
    const existing = agentMap.get(agentId);

    if (existing) {
      existing.total_deals++;
      existing.total_commission += Number(rec.commission_amount) || 0;
      if (rec.status === 'pending') existing.pending += Number(rec.commission_amount) || 0;
      if (rec.status === 'paid') existing.paid += Number(rec.commission_amount) || 0;
    } else {
      agentMap.set(agentId, {
        agent_id: agentId,
        agent_name: rec.agent?.full_name || 'Unknown',
        total_deals: 1,
        total_commission: Number(rec.commission_amount) || 0,
        pending: rec.status === 'pending' ? Number(rec.commission_amount) || 0 : 0,
        paid: rec.status === 'paid' ? Number(rec.commission_amount) || 0 : 0,
      });
    }
  }

  return Array.from(agentMap.values());
}

// ---------------------------------------------------------------------------
// 4. createCommissionRule — Set commission structure for a tenant
// ---------------------------------------------------------------------------

/**
 * Create or update a tenant-level commission rule.
 */
export async function createCommissionRule(
  tenantId: string,
  rule: Omit<CommissionRule, 'id' | 'tenant_id' | 'created_at' | 'updated_at'>,
): Promise<CommissionRule> {
  const supabase = getSupabase();

  const { data, error } = await (supabase.from('commission_rules') as any)
    .insert({
      tenant_id: tenantId,
      name: rule.name,
      rule_type: rule.rule_type,
      config: rule.config,
      is_active: rule.is_active ?? true,
    })
    .select()
    .single();

  if (error) {
    console.error('[commissions/queries] createCommissionRule error:', error);
    throw new Error(`Failed to create commission rule: ${error.message}`);
  }

  return data as CommissionRule;
}
