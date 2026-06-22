/**
 * Dashboard statistics queries for EstateFlow CRM.
 *
 * Provides aggregated metrics for the dashboard:
 *   - Lead counts (total, today, new, hot, conversion rate)
 *   - Property stats
 *   - Call stats
 *   - Agent performance
 *   - Revenue stats
 *
 * All functions are stubs — replace with actual DB queries when the
 * database client is connected.
 */

import type { UserRole } from '@/types/auth';
import type { PaginationMeta } from '@/lib/types';

// ─── Types ─────────────────────────────────────────────────────────────────

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
  new: number;        // status = 'new'
  contacted: number;
  qualified: number;
  hot: number;        // priority = 'high' | 'urgent'
  closedWon: number;
  closedLost: number;
  conversionRate: number; // percentage (closedWon / (closedWon + closedLost) * 100)
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
  averageDuration: number; // seconds
}

export interface AgentPerformanceSummary {
  totalAgents: number;
  activeAgents: number;
  topPerformers: AgentMetric[];
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

export interface RevenueStats {
  totalRevenue: number;
  thisMonth: number;
  thisQuarter: number;
  thisYear: number;
  averageDealSize: number;
  periodComparison: {
    monthOverMonth: number; // percentage change
    quarterOverQuarter: number;
    yearOverYear: number;
  };
}

export interface ActivityEntry {
  id: string;
  tenantId: string;
  userId: string;
  userName: string | null;
  type: ActivityType;
  entityType: string;
  entityId: string;
  description: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export type ActivityType =
  | 'lead_created'
  | 'lead_updated'
  | 'lead_assigned'
  | 'lead_status_changed'
  | 'call_scheduled'
  | 'call_completed'
  | 'call_missed'
  | 'message_sent'
  | 'deal_closed'
  | 'deal_lost'
  | 'note_added'
  | 'task_completed'
  | 'property_added'
  | 'property_updated'
  | 'property_sold'
  | 'agent_login'
  | 'webhook_received'
  | 'ai_call_updated';

export type RevenuePeriod = '7d' | '30d' | '90d' | '1y' | 'all';

// ─── In-memory store (stub — replace with DB) ──────────────────────────────

interface LeadRecord {
  id: string;
  tenant_id: string;
  assigned_to: string | null;
  status: string;
  priority: string | null;
  created_at: string;
  value: number | null;
  source: string;
}

interface CallRecord {
  id: string;
  tenant_id: string;
  lead_id: string;
  assigned_to: string;
  status: string;
  duration: number | null;
  created_at: string;
}

interface DealRecord {
  id: string;
  tenant_id: string;
  lead_id: string;
  agent_id: string;
  deal_value: number;
  commission: number;
  status: string;
  closed_at: string;
  created_at: string;
}

interface AgentRecord {
  id: string;
  tenant_id: string;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
}

interface PropertyRecord {
  id: string;
  tenant_id: string;
  title: string;
  status: string;
  price: number;
  created_at: string;
}

// Stub data stores — replace with actual DB client calls
const leadsStore: LeadRecord[] = [];
const callsStore: CallRecord[] = [];
const dealsStore: DealRecord[] = [];
const agentsStore: AgentRecord[] = [];
const propertiesStore: PropertyRecord[] = [];
const activityStore: ActivityEntry[] = [];

// ─── Dashboard Stats ────────────────────────────────────────────────────────

/**
 * Fetch aggregated dashboard statistics for a tenant.
 *
 * @param tenantId - The tenant UUID
 * @returns DashboardStats object
 */
export async function getDashboardStats(tenantId: string): Promise<DashboardStats> {
  // In production, replace with parallel DB queries:
  //   const [leadStats, propertyStats, callStats, agentStats, revenueStats] =
  //     await Promise.all([...])
  //
  // Example with Prisma:
  //   const leads = await prisma.leads.findMany({ where: { tenant_id: tenantId } });
  //   const calls = await prisma.calls.findMany({ where: { tenant_id: tenantId } });

  const tenantLeads = leadsStore.filter((l) => l.tenant_id === tenantId);
  const tenantCalls = callsStore.filter((c) => c.tenant_id === tenantId);
  const tenantDeals = dealsStore.filter((d) => d.tenant_id === tenantId);
  const tenantAgents = agentsStore.filter((a) => a.tenant_id === tenantId);
  const tenantProperties = propertiesStore.filter((p) => p.tenant_id === tenantId);

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const leadsToday = tenantLeads.filter((l) => new Date(l.created_at) >= todayStart).length;
  const leadsThisWeek = tenantLeads.filter((l) => new Date(l.created_at) >= weekStart).length;
  const leadsThisMonth = tenantLeads.filter((l) => new Date(l.created_at) >= monthStart).length;

  const newLeads = tenantLeads.filter((l) => l.status === 'new').length;
  const contactedLeads = tenantLeads.filter((l) => l.status === 'contacted').length;
  const qualifiedLeads = tenantLeads.filter((l) => l.status === 'qualified').length;
  const hotLeads = tenantLeads.filter(
    (l) => l.priority === 'high' || l.priority === 'urgent',
  ).length;
  const closedWon = tenantLeads.filter((l) => l.status === 'closed_won').length;
  const closedLost = tenantLeads.filter((l) => l.status === 'closed_lost').length;

  const totalClosed = closedWon + closedLost;
  const conversionRate = totalClosed > 0 ? Math.round((closedWon / totalClosed) * 100) : 0;

  // Properties
  const availableProps = tenantProperties.filter((p) => p.status === 'available').length;
  const soldProps = tenantProperties.filter((p) => p.status === 'sold').length;
  const rentedProps = tenantProperties.filter((p) => p.status === 'rented').length;
  const underOfferProps = tenantProperties.filter((p) => p.status === 'under_offer').length;

  const totalPropertyValue = tenantProperties.reduce((sum, p) => sum + p.price, 0);
  const averagePrice =
    tenantProperties.length > 0 ? Math.round(totalPropertyValue / tenantProperties.length) : 0;

  // Calls
  const completedCalls = tenantCalls.filter((c) => c.status === 'completed').length;
  const missedCalls = tenantCalls.filter((c) => c.status === 'missed').length;
  const scheduledCalls = tenantCalls.filter((c) => c.status === 'scheduled').length;

  const completedDurations = tenantCalls
    .filter((c) => c.status === 'completed' && c.duration !== null)
    .map((c) => c.duration as number);
  const averageDuration =
    completedDurations.length > 0
      ? Math.round(completedDurations.reduce((a, b) => a + b, 0) / completedDurations.length)
      : 0;

  // Agents
  const activeAgents = tenantAgents.filter((a) => a.is_active).length;

  // Agent metrics
  const agentMetrics: AgentMetric[] = tenantAgents.map((agent) => {
    const assignedLeads = tenantLeads.filter((l) => l.assigned_to === agent.id).length;
    const agentCalls = tenantCalls.filter((c) => c.assigned_to === agent.id).length;
    const agentDeals = tenantDeals.filter((d) => d.agent_id === agent.id);
    const wonDeals = agentDeals.filter((d) => d.status === 'closed_won').length;
    const totalAgentDeals = agentDeals.length;
    const agentConversion =
      totalAgentDeals > 0 ? Math.round((wonDeals / totalAgentDeals) * 100) : 0;
    const revenueGenerated = agentDeals
      .filter((d) => d.status === 'closed_won')
      .reduce((sum, d) => sum + d.commission, 0);

    return {
      agentId: agent.id,
      agentName: agent.full_name,
      leadsAssigned: assignedLeads,
      callsMade: agentCalls,
      dealsClosed: wonDeals,
      conversionRate: agentConversion,
      revenueGenerated,
    };
  });

  // Sort top performers by revenue generated
  const topPerformers = [...agentMetrics].sort((a, b) => b.dealsClosed - a.dealsClosed).slice(0, 5);

  // Revenue
  const wonDeals = tenantDeals.filter((d) => d.status === 'closed_won');
  const totalRevenue = wonDeals.reduce((sum, d) => sum + d.commission, 0);

  const monthDeals = wonDeals.filter((d) => new Date(d.closed_at) >= monthStart);
  const monthRevenue = monthDeals.reduce((sum, d) => sum + d.commission, 0);

  const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
  const quarterDeals = wonDeals.filter((d) => new Date(d.closed_at) >= quarterStart);
  const quarterRevenue = quarterDeals.reduce((sum, d) => sum + d.commission, 0);

  const yearStart = new Date(now.getFullYear(), 0, 1);
  const yearDeals = wonDeals.filter((d) => new Date(d.closed_at) >= yearStart);
  const yearRevenue = yearDeals.reduce((sum, d) => sum + d.commission, 0);

  const averageDealSize =
    wonDeals.length > 0
      ? Math.round(wonDeals.reduce((sum, d) => sum + d.deal_value, 0) / wonDeals.length)
      : 0;

  return {
    leads: {
      total: tenantLeads.length,
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
      total: tenantProperties.length,
      available: availableProps,
      sold: soldProps,
      rented: rentedProps,
      underOffer: underOfferProps,
      averagePrice,
    },
    calls: {
      total: tenantCalls.length,
      completed: completedCalls,
      missed: missedCalls,
      scheduled: scheduledCalls,
      averageDuration,
    },
    agents: {
      totalAgents: tenantAgents.length,
      activeAgents,
      topPerformers,
    },
    revenue: {
      totalRevenue,
      thisMonth: monthRevenue,
      thisQuarter: quarterRevenue,
      thisYear: yearRevenue,
      averageDealSize,
      periodComparison: {
        monthOverMonth: 0, // Would need historical data for comparison
        quarterOverQuarter: 0,
        yearOverYear: 0,
      },
    },
  };
}

// ─── Recent Activity ────────────────────────────────────────────────────────

/**
 * Fetch the most recent activity entries for a tenant.
 *
 * @param tenantId - The tenant UUID
 * @param limit    - Max number of entries to return (default 20)
 * @returns Array of ActivityEntry
 */
export async function getRecentActivity(
  tenantId: string,
  limit: number = 20,
): Promise<ActivityEntry[]> {
  // In production, replace with:
  //   const { data, error } = await supabase
  //     .from('activity_log')
  //     .select('*')
  //     .eq('tenant_id', tenantId)
  //     .order('created_at', { ascending: false })
  //     .limit(limit);

  const tenantActivities = activityStore
    .filter((a) => a.tenantId === tenantId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);

  return tenantActivities;
}

// ─── Agent Stats ────────────────────────────────────────────────────────────

/**
 * Fetch per-agent performance metrics for a tenant.
 *
 * @param tenantId - The tenant UUID
 * @returns Array of AgentMetric
 */
export async function getAgentStats(tenantId: string): Promise<AgentMetric[]> {
  const tenantAgents = agentsStore.filter((a) => a.tenant_id === tenantId);
  const tenantLeads = leadsStore.filter((l) => l.tenant_id === tenantId);
  const tenantCalls = callsStore.filter((c) => c.tenant_id === tenantId);
  const tenantDeals = dealsStore.filter((d) => d.tenant_id === tenantId);

  return tenantAgents.map((agent) => {
    const assignedLeads = tenantLeads.filter((l) => l.assigned_to === agent.id).length;
    const agentCalls = tenantCalls.filter((c) => c.assigned_to === agent.id).length;
    const agentDeals = tenantDeals.filter((d) => d.agent_id === agent.id);
    const wonDeals = agentDeals.filter((d) => d.status === 'closed_won').length;
    const totalAgentDeals = agentDeals.length;
    const agentConversion =
      totalAgentDeals > 0 ? Math.round((wonDeals / totalAgentDeals) * 100) : 0;
    const revenueGenerated = agentDeals
      .filter((d) => d.status === 'closed_won')
      .reduce((sum, d) => sum + d.commission, 0);

    return {
      agentId: agent.id,
      agentName: agent.full_name,
      leadsAssigned: assignedLeads,
      callsMade: agentCalls,
      dealsClosed: wonDeals,
      conversionRate: agentConversion,
      revenueGenerated,
    };
  });
}

// ─── Revenue Stats ──────────────────────────────────────────────────────────

/**
 * Fetch revenue statistics for a tenant over a specified period.
 *
 * @param tenantId - The tenant UUID
 * @param period   - Time period ('7d' | '30d' | '90d' | '1y' | 'all')
 * @returns RevenueStats
 */
export async function getRevenueStats(
  tenantId: string,
  period: RevenuePeriod = '30d',
): Promise<RevenueStats> {
  const tenantDeals = dealsStore.filter(
    (d) => d.tenant_id === tenantId && d.status === 'closed_won',
  );

  const now = new Date();
  let periodStart: Date;

  switch (period) {
    case '7d':
      periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case '30d':
      periodStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case '90d':
      periodStart = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      break;
    case '1y':
      periodStart = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
      break;
    case 'all':
    default:
      periodStart = new Date(0);
      break;
  }

  const periodDeals = tenantDeals.filter(
    (d) => new Date(d.closed_at) >= periodStart,
  );

  const totalRevenue = periodDeals.reduce((sum, d) => sum + d.commission, 0);
  const totalDealValue = periodDeals.reduce((sum, d) => sum + d.deal_value, 0);
  const averageDealSize = periodDeals.length > 0
    ? Math.round(totalDealValue / periodDeals.length)
    : 0;

  // Month over month comparison
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const thisMonthDeals = periodDeals.filter((d) => new Date(d.closed_at) >= monthStart);
  const lastMonthDeals = tenantDeals.filter(
    (d) =>
      new Date(d.closed_at) >= lastMonthStart && new Date(d.closed_at) < monthStart,
  );
  const thisMonthRevenue = thisMonthDeals.reduce((sum, d) => sum + d.commission, 0);
  const lastMonthRevenue = lastMonthDeals.reduce((sum, d) => sum + d.commission, 0);

  const monthOverMonth =
    lastMonthRevenue > 0
      ? Math.round(((thisMonthRevenue - lastMonthRevenue) / lastMonthRevenue) * 100)
      : 0;

  // Quarter over quarter
  const currentQuarter = Math.floor(now.getMonth() / 3);
  const quarterStart = new Date(now.getFullYear(), currentQuarter * 3, 1);
  const lastQuarterStart = new Date(
    currentQuarter === 0 ? now.getFullYear() - 1 : now.getFullYear(),
    currentQuarter === 0 ? 9 : (currentQuarter - 1) * 3,
    1,
  );
  const thisQuarterDeals = periodDeals.filter((d) => new Date(d.closed_at) >= quarterStart);
  const lastQuarterDeals = tenantDeals.filter(
    (d) =>
      new Date(d.closed_at) >= lastQuarterStart &&
      new Date(d.closed_at) < quarterStart,
  );
  const thisQuarterRevenue = thisQuarterDeals.reduce((sum, d) => sum + d.commission, 0);
  const lastQuarterRevenue = lastQuarterDeals.reduce((sum, d) => sum + d.commission, 0);

  const quarterOverQuarter =
    lastQuarterRevenue > 0
      ? Math.round(((thisQuarterRevenue - lastQuarterRevenue) / lastQuarterRevenue) * 100)
      : 0;

  // Year over year
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const lastYearStart = new Date(now.getFullYear() - 1, 0, 1);
  const thisYearDeals = periodDeals.filter((d) => new Date(d.closed_at) >= yearStart);
  const lastYearDeals = tenantDeals.filter(
    (d) =>
      new Date(d.closed_at) >= lastYearStart && new Date(d.closed_at) < yearStart,
  );
  const thisYearRevenue = thisYearDeals.reduce((sum, d) => sum + d.commission, 0);
  const lastYearRevenue = lastYearDeals.reduce((sum, d) => sum + d.commission, 0);

  const yearOverYear =
    lastYearRevenue > 0
      ? Math.round(((thisYearRevenue - lastYearRevenue) / lastYearRevenue) * 100)
      : 0;

  return {
    totalRevenue,
    thisMonth: thisMonthRevenue,
    thisQuarter: thisQuarterRevenue,
    thisYear: thisYearRevenue,
    averageDealSize,
    periodComparison: {
      monthOverMonth,
      quarterOverQuarter,
      yearOverYear,
    },
  };
}

// ─── Public exports for stub store (useful for testing/seed data) ──────────

export {
  leadsStore,
  callsStore,
  dealsStore,
  agentsStore,
  propertiesStore,
  activityStore,
};
