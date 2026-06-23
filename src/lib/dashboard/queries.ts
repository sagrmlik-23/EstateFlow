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

// ─── Dashboard Stats ────────────────────────────────────────────────────────

export async function getDashboardStats(tenantId: string): Promise<DashboardStats> {
  const supabase = getDb();

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  // 1. Lead counts
  const { count: totalLeads } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);

  const { count: leadsToday } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .gte('created_at', todayStart);

  const { count: leadsThisMonth } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .gte('created_at', monthStart);

  const { count: newLeads } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('status', 'new');

  const { count: contactedLeads } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('status', 'contacted');

  const { count: qualifiedLeads } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('status', 'qualified');

  const { count: closedWon } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('status', 'won');

  const { count: closedLost } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('status', 'lost');

  const { count: hotLeads } = await supabase
    .from('leads')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .gte('ai_score', 80);

  const totalClosed = (closedWon ?? 0) + (closedLost ?? 0);
  const conversionRate = totalClosed > 0 ? Math.round(((closedWon ?? 0) / totalClosed) * 100) : 0;

  // 2. Properties
  const { count: totalProps } = await supabase
    .from('properties')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);

  const { count: availableProps } = await supabase
    .from('properties')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('availability_status', 'available');

  const { count: soldProps } = await supabase
    .from('properties')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('availability_status', 'sold');

  const { count: rentedProps } = await supabase
    .from('properties')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('availability_status', 'rented');

  const { count: underOfferProps } = await supabase
    .from('properties')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('availability_status', 'under_offer');

  // Average property price
  const { data: priceRows } = await supabase
    .from('properties')
    .select('price')
    .eq('tenant_id', tenantId);

  const priceArr: number[] = (priceRows ?? []).map((r: Record<string, unknown>) => Number(r.price));
  const averagePrice = priceArr.length > 0
    ? Math.round(priceArr.reduce((a: number, b: number) => a + b, 0) / priceArr.length)
    : 0;

  // 3. Calls (from communication_logs where type = 'call')
  const { count: totalCalls } = await supabase
    .from('communication_logs')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('type', 'call');

  const { count: completedCalls } = await supabase
    .from('communication_logs')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('type', 'call')
    .eq('status', 'completed');

  const { count: missedCalls } = await supabase
    .from('communication_logs')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('type', 'call')
    .eq('status', 'failed');

  const { count: scheduledCalls } = await supabase
    .from('communication_logs')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('type', 'call')
    .eq('status', 'scheduled');

  // 4. Agents
  const { data: agentRows } = await supabase
    .from('users')
    .select('id, full_name, is_active')
    .eq('tenant_id', tenantId)
    .in('role', ['agent', 'org_admin']);

  const agentList: Array<{ id: string; full_name: string; is_active: boolean }> = agentRows ?? [];
  const totalAgents = agentList.length;
  const activeAgents = agentList.filter((a: { is_active: boolean }) => a.is_active).length;

  const agentMetrics: AgentMetric[] = [];
  for (const agent of agentList) {
    const { count: assignedLeads } = await supabase
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('assigned_agent_id', agent.id);

    agentMetrics.push({
      agentId: agent.id,
      agentName: agent.full_name,
      leadsAssigned: assignedLeads ?? 0,
      callsMade: 0,
      dealsClosed: 0,
      conversionRate: 0,
      revenueGenerated: 0,
    });
  }

  const topPerformers = [...agentMetrics].sort(
    (a: AgentMetric, b: AgentMetric) => b.leadsAssigned - a.leadsAssigned,
  ).slice(0, 5);

  // 5. Revenue (from deals)
  const { data: wonDealRows } = await supabase
    .from('deals')
    .select('value, commission, closed_at')
    .eq('tenant_id', tenantId)
    .eq('stage', 'closed_won');

  const wonDealsArr: Array<{ value: number; commission: number; closed_at: string }> = wonDealRows ?? [];
  const totalRevenue = wonDealsArr.reduce(
    (sum: number, d: { commission: number }) => sum + (d.commission ?? 0), 0,
  );
  const monthDealsArr = wonDealsArr.filter(
    (d: { closed_at: string }) => d.closed_at && d.closed_at >= monthStart,
  );
  const monthRevenue = monthDealsArr.reduce(
    (sum: number, d: { commission: number }) => sum + (d.commission ?? 0), 0,
  );
  const totalDealValue = wonDealsArr.reduce(
    (sum: number, d: { value: number }) => sum + (d.value ?? 0), 0,
  );
  const averageDealSize = wonDealsArr.length > 0
    ? Math.round(totalDealValue / wonDealsArr.length)
    : 0;

  return {
    leads: {
      total: totalLeads ?? 0,
      today: leadsToday ?? 0,
      thisWeek: leadsThisMonth ?? 0,
      thisMonth: leadsThisMonth ?? 0,
      new: newLeads ?? 0,
      contacted: contactedLeads ?? 0,
      qualified: qualifiedLeads ?? 0,
      hot: hotLeads ?? 0,
      closedWon: closedWon ?? 0,
      closedLost: closedLost ?? 0,
      conversionRate,
    },
    properties: {
      total: totalProps ?? 0,
      available: availableProps ?? 0,
      sold: soldProps ?? 0,
      rented: rentedProps ?? 0,
      underOffer: underOfferProps ?? 0,
      averagePrice,
    },
    calls: {
      total: totalCalls ?? 0,
      completed: completedCalls ?? 0,
      missed: missedCalls ?? 0,
      scheduled: scheduledCalls ?? 0,
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

  const stats: AgentStat[] = [];
  for (const agent of agentList) {
    const { count: leadCount } = await supabase
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('assigned_agent_id', agent.id);

    stats.push({
      id: agent.id,
      fullName: agent.full_name,
      email: agent.email ?? '',
      phone: agent.phone ?? '',
      role: agent.role as UserRole,
      isActive: agent.is_active,
      leadCount: leadCount ?? 0,
      wonDeals: 0,
      totalDealValue: 0,
    });
  }

  return stats;
}
