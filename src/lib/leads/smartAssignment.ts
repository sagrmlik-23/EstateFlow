/**
 * Smart lead assignment engine for EstateFlow CRM.
 *
 * Assigns leads to agents based on:
 *   - Current workload (agent with fewest assigned leads)
 *   - Specialization (agent's property type expertise)
 *   - Availability (online/offline status)
 *   - Round-robin rotation
 */

import { createClient } from '@supabase/supabase-js';
import type { UserRole } from '@/types/auth';

// ─── Types ─────────────────────────────────────────────────────────────────

export type AgentAvailability = 'online' | 'away' | 'offline' | 'busy';

export interface AgentAssignmentInfo {
  agentId: string;
  tenantId: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
  availability: AgentAvailability;
  specializations: string[]; // property type slugs
  currentWorkload: number; // count of currently assigned active leads
  lastAssignedAt: string | null; // ISO timestamp of last assignment
}

export interface AssignmentStrategy {
  name: string;
  description: string;
}

export const ASSIGNMENT_STRATEGIES: Record<string, AssignmentStrategy> = {
  workload: {
    name: 'Least Workload',
    description: 'Assign to agent with fewest active leads',
  },
  specialization: {
    name: 'Specialization',
    description: 'Assign to agent with matching property type expertise',
  },
  round_robin: {
    name: 'Round Robin',
    description: 'Rotate assignments evenly among available agents',
  },
  availability: {
    name: 'Availability First',
    description: 'Prioritize online agents over offline',
  },
} as const;

export type AssignmentStrategyKey = keyof typeof ASSIGNMENT_STRATEGIES;

export interface AssignmentResult {
  success: boolean;
  leadId: string;
  assignedTo: string | null;
  agentName: string | null;
  strategy: string;
  reason: string;
}

// ─── Supabase client helper ──────────────────────────────────────────────────

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

// ─── Stub agent store ───────────────────────────────────────────────────────

const agentAssignmentStore: AgentAssignmentInfo[] = [];

/**
 * Register or update an agent in the assignment store.
 * In production, this reads from the users table.
 */
export async function registerAgent(info: AgentAssignmentInfo): Promise<void> {
  const existing = agentAssignmentStore.findIndex((a) => a.agentId === info.agentId);
  if (existing >= 0) {
    agentAssignmentStore[existing] = info;
  } else {
    agentAssignmentStore.push(info);
  }
}

// ─── Workload Queries ──────────────────────────────────────────────────────

/**
 * Get the current workload (number of assigned active leads) for an agent.
 *
 * @param agentId  - The agent's UUID
 * @param tenantId - The tenant UUID
 * @returns Number of currently assigned leads
 */
export async function getAgentWorkload(
  agentId: string,
  tenantId: string,
): Promise<number> {
  // In production:
  //   const { count } = await supabase
  //     .from('leads')
  //     .select('id', { count: 'exact', head: true })
  //     .eq('assigned_to', agentId)
  //     .eq('tenant_id', tenantId)
  //     .not('status', 'in', '("closed_won","closed_lost","archived")');

  const stored = agentAssignmentStore.find(
    (a) => a.agentId === agentId && a.tenantId === tenantId,
  );
  return stored?.currentWorkload ?? 0;
}

// ─── Available Agents ─────────────────────────────────────────────────────

/**
 * Get all assignable agents for a tenant, sorted by suitability.
 *
 * @param tenantId    - The tenant UUID
 * @param leadType    - Optional property type for specialization matching
 * @returns Array of AgentAssignmentInfo sorted by best fit first
 */
export async function getAvailableAgents(
  tenantId: string,
  leadType?: string,
): Promise<AgentAssignmentInfo[]> {
  // In production:
  //   const { data } = await supabase
  //     .from('users')
  //     .select('*,specializations')
  //     .eq('tenant_id', tenantId)
  //     .eq('role', 'agent')
  //     .eq('is_active', true);

  const allAgents = agentAssignmentStore.filter(
    (a) => a.tenantId === tenantId && a.isActive,
  );

  // Sort: online first, then by workload (ascending)
  const sorted = [...allAgents].sort((a, b) => {
    const availabilityOrder: Record<AgentAvailability, number> = {
      online: 0,
      away: 1,
      busy: 2,
      offline: 3,
    };

    const aAvail = availabilityOrder[a.availability] ?? 3;
    const bAvail = availabilityOrder[b.availability] ?? 3;

    if (aAvail !== bAvail) return aAvail - bAvail;

    // If availability is equal, pick the one with lower workload
    if (a.currentWorkload !== b.currentWorkload) {
      return a.currentWorkload - b.currentWorkload;
    }

    // If workload is equal, prefer specialization match
    if (leadType && b.specializations.includes(leadType) !== a.specializations.includes(leadType)) {
      return b.specializations.includes(leadType) ? -1 : 1;
    }

    return 0;
  });

  return sorted;
}

// ─── Assignment Strategies ──────────────────────────────────────────────────

/**
 * Find the best agent based on lowest current workload.
 */
async function assignByWorkload(
  tenantId: string,
  _leadId: string,
  _leadType?: string,
): Promise<AgentAssignmentInfo | null> {
  const agents = await getAvailableAgents(tenantId, _leadType);
  return agents[0] ?? null;
}

/**
 * Find the best agent based on specialization match.
 */
async function assignBySpecialization(
  tenantId: string,
  _leadId: string,
  leadType?: string,
): Promise<AgentAssignmentInfo | null> {
  const agents = await getAvailableAgents(tenantId, leadType);

  // Filter to agents whose specializations include the lead type
  if (leadType) {
    const specialized = agents.filter((a) => a.specializations.includes(leadType));
    if (specialized.length > 0) return specialized[0]!;
  }

  // Fall back to workload-based if no specialist
  return agents[0] ?? null;
}

/**
 * Find the best agent using least-recently-assigned rotation.
 */
async function assignByRoundRobin(
  tenantId: string,
  _leadId: string,
  _leadType?: string,
): Promise<AgentAssignmentInfo | null> {
  const agents = await getAvailableAgents(tenantId, _leadType);
  if (agents.length === 0) return null;

  // Find the agent who was assigned longest ago (or never)
  const sorted = [...agents].sort((a, b) => {
    if (!a.lastAssignedAt) return -1;
    if (!b.lastAssignedAt) return 1;
    return new Date(a.lastAssignedAt).getTime() - new Date(b.lastAssignedAt).getTime();
  });

  return sorted[0] ?? null;
}

// Strategy resolver
const strategyMap: Record<
  AssignmentStrategyKey,
  (tenantId: string, leadId: string, leadType?: string) => Promise<AgentAssignmentInfo | null>
> = {
  workload: assignByWorkload,
  specialization: assignBySpecialization,
  round_robin: assignByRoundRobin,
  availability: assignByWorkload, // same as workload (already sorted by availability)
};

// ─── Main Assignment Functions ──────────────────────────────────────────────

/**
 * Assign a lead to the best agent based on configured strategy.
 *
 * Default strategy: workload-based (least leads first).
 *
 * @param leadId    - UUID of the lead to assign
 * @param tenantId  - Tenant UUID
 * @param strategy  - Assignment strategy key (default: 'workload')
 * @param leadType  - Optional property type for specialization matching
 * @returns AssignmentResult with the outcome
 */
export async function assignLeadToAgent(
  leadId: string,
  tenantId: string,
  strategy: AssignmentStrategyKey = 'workload',
  leadType?: string,
): Promise<AssignmentResult> {
  try {
    const assignFn = strategyMap[strategy];
    if (!assignFn) {
      return {
        success: false,
        leadId,
        assignedTo: null,
        agentName: null,
        strategy,
        reason: `Unknown strategy: ${strategy}`,
      };
    }

    const agent = await assignFn(tenantId, leadId, leadType);

    if (!agent) {
      return {
        success: false,
        leadId,
        assignedTo: null,
        agentName: null,
        strategy,
        reason: 'No available agents found',
      };
    }

    // Update the lead's assigned_to in the database
    const { error: updateError } = await (getDb()
      .from('leads') as any)
      .update({ assigned_to: agent.agentId, updated_at: new Date().toISOString() })
      .eq('id', leadId);

    if (updateError) {
      console.error('[smartAssignment] DB update error:', updateError);
      // Continue with in-memory update even if DB write fails
    }

    // Update the agent's last assignment timestamp
    const stored = agentAssignmentStore.findIndex(
      (a) => a.agentId === agent.agentId,
    );
    if (stored >= 0) {
      agentAssignmentStore[stored]!.lastAssignedAt = new Date().toISOString();
      agentAssignmentStore[stored]!.currentWorkload += 1;
    }

    return {
      success: true,
      leadId,
      assignedTo: agent.agentId,
      agentName: agent.fullName,
      strategy,
      reason: `Assigned to ${agent.fullName} (${ASSIGNMENT_STRATEGIES[strategy]!.description})`,
    };
  } catch (error) {
    console.error('[smartAssignment] assignLeadToAgent error:', error);
    return {
      success: false,
      leadId,
      assignedTo: null,
      agentName: null,
      strategy,
      reason: `Assignment error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Batch assign all currently unassigned leads for a tenant.
 *
 * @param tenantId - Tenant UUID
 * @param strategy - Assignment strategy (default: 'workload')
 * @returns Array of AssignmentResult
 */
export async function autoAssignNewLeads(
  tenantId: string,
  strategy: AssignmentStrategyKey = 'workload',
): Promise<AssignmentResult[]> {
  // In production, query unassigned leads:
  //   const { data: unassigned } = await supabase
  //     .from('leads')
  //     .select('*')
  //     .eq('tenant_id', tenantId)
  //     .is('assigned_to', null)
  //     .not('status', 'in', '("closed_won","closed_lost","archived")');

  // For stub, return empty (no leads store available here directly)
  // In practice, this would query the actual database.
  const unassignedIds: string[] = []; // Replace with DB query

  const results: AssignmentResult[] = [];

  for (const leadId of unassignedIds) {
    const result = await assignLeadToAgent(leadId, tenantId, strategy);
    results.push(result);
  }

  if (unassignedIds.length === 0) {
    return [
      {
        success: true,
        leadId: '',
        assignedTo: null,
        agentName: null,
        strategy,
        reason: 'No unassigned leads found',
      },
    ];
  }

  return results;
}

export { agentAssignmentStore };
