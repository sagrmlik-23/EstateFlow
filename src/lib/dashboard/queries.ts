/**
 * Dashboard statistics queries for EstateFlow CRM.
 *
 * Aggregates real data from Supabase for dashboard metrics.
 */
import { createClient } from '@supabase/supabase-js';
import type { UserRole } from '@/types/auth';
import type { PaginationMeta } from '@/lib/types';

// ─── Types ─────────────────────────────────────────────────────────────────

export type ActivityType =
  | 'call'
  | 'email'
  | 'sms'
  | 'whatsapp'
  | 'visit'
  | 'lead_create'
  | 'lead_update'
  | 'lead_status_change'
  | 'lead_assign'
  | 'property_create'
  | 'property_update'
  | 'deal_create'
  | 'deal_stage_change'
  | 'deal_assign'
  | 'task_create'
  | 'task_complete'
  | 'note_add'
  | 'login'
  | 'logout'
  | 'system'
  | 'ai_call_updated'
  | 'webhook_received'
  | 'call_completed';

export interface DashboardStats {
  leads: LeadDashboardStats;
  properties: PropertyDashboardStats;
  calls: CallDashboardStats;
  agents: AgentPerformanceSummary;
  revenue: RevenueStats;
}

export interface LeadDashboardStats {
  total: number;
  today: number;
  thisWeek: number;
  thisMonth: number;
  new: number;
  contacted: number;
  qualified: number;
  hot: number;
  closedWon: number;
  closedLost: number;
  conversionRate: number;
}

export interface PropertyDashboardStats {
  total: number;
  available: number;
  sold: number;
  rented: number;
  underOffer: number;
  averagePrice: number;
}

export interface CallDashboardStats {
  total: number;
  completed: number;
  missed: number;
  scheduled: number;
  averageDuration: number;
}

export interface AgentPerformanceSummary {
  totalAgents: number;
  activeAgents: number;
  topPerformers: AgentMetric[];
}

export interface RevenueStats {
  totalRevenue: number;
  monthRevenue: number;
  quarterRevenue: number;
  yearRevenue: number;
  averageDealSize: number;
  periodComparison: {
    monthOverMonth: number;
    quarterOverQuarter: number;
    yearOverYear: number;
  };
}

export interface AgentMetric {
  agentId: string;
  agentName: string;
  leadsAssigned: number;
  callsMade: number;
  dealsClosed: number;
  conversionRate: number;
  revenueGenerated: number;
}

export interface ActivityEntry {
  id: string;
  tenantId: string;
  userId: string;
  userName: string;
  action: string;
  entityType: string;
  entityId: string;
  type: ActivityType;
  description: string;
  metadata?: Record<string, unknown>;
  summary: string;
  createdAt: string;
}

export interface AgentStat {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  role: UserRole;
  isActive: boolean;
  leadCount: number;
  wonDeals: number;
  totalDealValue: number;
}

// ─── Supabase client singleton ──────────────────────────────────────────────

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

// ─── Dashboard Stats ────────────────────────────────────────────────────────

export async function getDashboardStats(tenantId: string): Promise<DashboardStats> {
  const supabase = getDb();

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay()).toISOString();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  // ── 1. Leads — single query fetching status + ai_score + created_at, aggregate in-memory ──
  const { data: leadRows, error: leadErr } = await supabase
    .from('leads')
    .select('status, ai_score, created_at')
    .eq('tenant_id', tenantId);

  if (leadErr) {
    console.error('[dashboard/queries] leads fetch error:', leadErr);
    throw new Error(`Failed to fetch lead stats: ${leadErr.message}`);
  }

  const leadsArr = (leadRows ?? []) as Array<{ status: string; ai_score: number | null; created_at: string }>;

  let totalLeads = 0, leadsToday = 0, leadsThisWeek = 0, leadsThisMonth = 0;
  let newLeads = 0, contactedLeads = 0, qualifiedLeads = 0, closedWon = 0, closedLost = 0, hotLeads = 0;

  for (const l of leadsArr) {
    totalLeads++;
    if (l.created_at >= todayStart) leadsToday++;
    if (l.created_at >= weekStart) leadsThisWeek++;
    if (l.created_at >= monthStart) leadsThisMonth++;
    switch (l.status) {
      case 'new': newLeads++; break;
      case 'contacted': contactedLeads++; break;
      case 'qualified': qualifiedLeads++; break;
      case 'closed_won': closedWon++; break;
      case 'closed_lost': closedLost++; break;
    }
    if ((l.ai_score ?? 0) >= 80) hotLeads++;
  }

  const totalClosed = closedWon + closedLost;
  const conversionRate = totalClosed > 0 ? Math.round((closedWon / totalClosed) * 100) : 0;

  // ── 2. Properties — single query, aggregate in-memory ──
  const { data: propRows, error: propErr } = await supabase
    .from('properties')
    .select('availability_status, price')
    .eq('tenant_id', tenantId);

  if (propErr) {
    console.error('[dashboard/queries] properties fetch error:', propErr);
    throw new Error(`Failed to fetch property stats: ${propErr.message}`);
  }

  const propsArr = (propRows ?? []) as Array<{ availability_status: string; price: number }>;

  let totalProps = 0, availableProps = 0, soldProps = 0, rentedProps = 0, underOfferProps = 0;
  let priceSum = 0;

  for (const p of propsArr) {
    totalProps++;
    switch (p.availability_status) {
      case 'available': availableProps++; break;
      case 'sold': soldProps++; break;
      case 'rented': rentedProps++; break;
      case 'under_offer': underOfferProps++; break;
    }
    priceSum += Number(p.price) || 0;
  }

  const averagePrice = totalProps > 0 ? Math.round(priceSum / totalProps) : 0;

  // ── 3. Calls — single query from communication_logs, aggregate in-memory ──
  const { data: callRows, error: callErr } = await supabase
    .from('communication_logs')
    .select('status')
    .eq('tenant_id', tenantId)
    .eq('type', 'call');

  if (callErr) {
    console.error('[dashboard/queries] communication_logs fetch error:', callErr);
    throw new Error(`Failed to fetch call stats: ${callErr.message}`);
  }

  const callsArr = (callRows ?? []) as Array<{ status: string }>;

  let totalCalls = 0, completedCalls = 0, missedCalls = 0, scheduledCalls = 0;
  for (const c of callsArr) {
    totalCalls++;
    switch (c.status) {
      case 'completed': completedCalls++; break;
      case 'failed': missedCalls++; break;
      case 'scheduled': scheduledCalls++; break;
    }
  }

  // ── 4. Agents — single query with batch lead counts using a lateral join ──
  const { data: agentRows, error: agentErr } = await supabase
    .from('users')
    .select('id, full_name, is_active')
    .eq('tenant_id', tenantId)
    .in('role', ['agent', 'org_admin']);

  if (agentErr) {
    console.error('[dashboard/queries] agents fetch error:', agentErr);
    throw new Error(`Failed to fetch agent stats: ${agentErr.message}`);
  }

  const agentList = (agentRows ?? []) as Array<{ id: string; full_name: string; is_active: boolean }>;
  const totalAgents = agentList.length;
  const activeAgents = agentList.filter((a) => a.is_active).length;

  // Batch fetch all lead counts per agent in a single query
  const agentIds = agentList.map((a) => a.id);
  const agentMetrics: AgentMetric[] = agentList.map((agent) => ({
    agentId: agent.id,
    agentName: agent.full_name,
    leadsAssigned: 0,
    callsMade: 0,
    dealsClosed: 0,
    conversionRate: 0,
    revenueGenerated: 0,
  }));

  if (agentIds.length > 0) {
    const { data: agentLeadCounts, error: leadCountErr } = await supabase
      .from('leads')
      .select('assigned_agent_id')
      .eq('tenant_id', tenantId)
      .in('assigned_agent_id', agentIds);

    if (!leadCountErr && agentLeadCounts) {
      const countMap: Record<string, number> = {};
      for (const row of agentLeadCounts as Array<{ assigned_agent_id: string }>) {
        const id = row.assigned_agent_id;
        if (id) countMap[id] = (countMap[id] ?? 0) + 1;
      }
      for (const m of agentMetrics) {
        m.leadsAssigned = countMap[m.agentId] ?? 0;
      }
    }
  }

  const topPerformers = [...agentMetrics].sort(
    (a, b) => b.leadsAssigned - a.leadsAssigned,
  ).slice(0, 5);

  // ── 5. Revenue — single deals query for closed_won ──
  const { data: wonDealRows, error: wonDealErr } = await supabase
    .from('deals')
    .select('value, commission, closed_at')
    .eq('tenant_id', tenantId)
    .eq('stage', 'closed_won');

  if (wonDealErr) {
    console.error('[dashboard/queries] deals fetch error:', wonDealErr);
    throw new Error(`Failed to fetch revenue stats: ${wonDealErr.message}`);
  }

  const wonDealsArr = (wonDealRows ?? []) as Array<{ value: number; commission: number; closed_at: string }>;
  const totalRevenue = wonDealsArr.reduce((sum, d) => sum + (d.commission ?? 0), 0);
  const monthDealsArr = wonDealsArr.filter((d) => d.closed_at && d.closed_at >= monthStart);
  const monthRevenue = monthDealsArr.reduce((sum, d) => sum + (d.commission ?? 0), 0);
  const totalDealValue = wonDealsArr.reduce((sum, d) => sum + (d.value ?? 0), 0);
  const averageDealSize = wonDealsArr.length > 0
    ? Math.round(totalDealValue / wonDealsArr.length)
    : 0;

  return {
    leads: {
      total: totalLeads,
      today: leadsToday,
      thisWeek: leadsThisWeek,
      thisMonth: leadsThisMonth,
      new: newLeads,
      contacted: contactedLeads,
      qualified: qualifiedLeads,
      hot: hotLeads,
      closedWon,
      closedLost,
      conversionRate,
    },
    properties: {
      total: totalProps,
      available: availableProps,
      sold: soldProps,
      rented: rentedProps,
      underOffer: underOfferProps,
      averagePrice,
    },
    calls: {
      total: totalCalls,
      completed: completedCalls,
      missed: missedCalls,
      scheduled: scheduledCalls,
      averageDuration: 0,
    },
    agents: {
      totalAgents,
      activeAgents,
      topPerformers,
    },
    revenue: {
      totalRevenue,
      monthRevenue,
      quarterRevenue: monthRevenue,
      yearRevenue: monthRevenue,
      averageDealSize,
      periodComparison: {
        monthOverMonth: 0,
        quarterOverQuarter: 0,
        yearOverYear: 0,
      },
    },
  };
}

// ─── Recent Activity ────────────────────────────────────────────────────────

export async function getRecentActivity(
  tenantId: string,
  limitNum: number = 10,
): Promise<ActivityEntry[]> {
  const supabase = getDb();

  const { data: logRows } = await supabase
    .from('audit_logs')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(limitNum);

  return (logRows ?? []).map((log: Record<string, unknown>) => ({
    id: String(log.id ?? ''),
    tenantId: String(log.tenant_id ?? ''),
    userId: String(log.user_id ?? ''),
    userName: String(log.user_name ?? 'Unknown'),
    action: String(log.action ?? ''),
    entityType: String(log.entity_type ?? ''),
    entityId: String(log.entity_id ?? ''),
    type: (String(log.action ?? 'system') as ActivityType),
    description: String(log.description ?? ''),
    summary: `${log.action ?? ''} ${log.entity_type ?? ''}`,
    createdAt: String(log.created_at ?? ''),
  }));
}

// ─── Agent Stats ────────────────────────────────────────────────────────────

export async function getAgentStats(tenantId: string): Promise<AgentStat[]> {
  const supabase = getDb();

  const { data: agentRows } = await supabase
    .from('users')
    .select('id, full_name, email, phone, role, is_active')
    .eq('tenant_id', tenantId)
    .in('role', ['agent', 'org_admin']);

  const agentList: Array<{
    id: string; full_name: string; email: string; phone: string;
    role: string; is_active: boolean;
  }> = agentRows ?? [];

  // Batch fetch lead counts per agent in a single query
  const agentIds = agentList.map((a) => a.id);
  const countMap: Record<string, number> = {};

  if (agentIds.length > 0) {
    const { data: leadCounts } = await supabase
      .from('leads')
      .select('assigned_agent_id')
      .eq('tenant_id', tenantId)
      .in('assigned_agent_id', agentIds);

    for (const row of (leadCounts ?? []) as Array<{ assigned_agent_id: string }>) {
      const id = row.assigned_agent_id;
      if (id) countMap[id] = (countMap[id] ?? 0) + 1;
    }
  }

  return agentList.map((agent) => ({
    id: agent.id,
    fullName: agent.full_name,
    email: agent.email ?? '',
    phone: agent.phone ?? '',
    role: agent.role as UserRole,
    isActive: agent.is_active,
    leadCount: countMap[agent.id] ?? 0,
    wonDeals: 0,
    totalDealValue: 0,
  }));
}
