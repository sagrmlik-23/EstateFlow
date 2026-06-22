// ============================================================================
// EstateFlow CRM — Handoff Service (Bot → Human Agent)
// Phase 5 — AI Chatbot (AGENT-5-3-WHATSAPP-CHATBOT)
// ============================================================================
//
// HandoffService manages the process of transferring a chatbot conversation
// to a human agent when the bot cannot handle the query or the user requests it.
// ============================================================================

import type {
  HandoffRequest,
  HandoffStatus,
  HandoffReason,
  CreateHandoffInput,
  AssignHandoffInput,
  ChatAgent,
} from '@/types/chatbot';

// ---------------------------------------------------------------------------
// In-memory stores (production would use Redis/DB)
// ---------------------------------------------------------------------------

const handoffs = new Map<string, HandoffRequest>();
const agents = new Map<string, ChatAgent>();

// ---------------------------------------------------------------------------
// HandoffService
// ---------------------------------------------------------------------------

export class HandoffService {
  public readonly name = 'handoff-service';

  // -----------------------------------------------------------------------
  // requestHandoff — Create a new handoff request
  // -----------------------------------------------------------------------

  async requestHandoff(
    input: CreateHandoffInput,
  ): Promise<{ success: boolean; handoff?: HandoffRequest; error?: string }> {
    try {
      // Validate input
      if (!input.sessionId || !input.phoneNumber || !input.reason) {
        return {
          success: false,
          error: 'sessionId, phoneNumber, and reason are required',
        };
      }

      // Check if there's already a pending handoff for this session
      const existing = this.getPendingHandoffForSession(input.sessionId);
      if (existing) {
        return {
          success: true,
          handoff: existing,
        };
      }

      const handoff: HandoffRequest = {
        id: crypto.randomUUID(),
        sessionId: input.sessionId,
        tenantId: input.tenantId,
        phoneNumber: input.phoneNumber,
        reason: input.reason,
        notes: input.notes,
        status: 'pending',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      handoffs.set(handoff.id, handoff);

      console.log('[HandoffService] Handoff requested:', {
        id: handoff.id,
        sessionId: handoff.sessionId,
        reason: handoff.reason,
        tenantId: handoff.tenantId,
      });

      // Auto-assign if agents are available
      const availableAgents = await this.getAvailableAgents(input.tenantId);
      if (availableAgents.length > 0) {
        // Assign to first available agent
        const assigned = await this.assignHandoff({
          handoffId: handoff.id,
          agentId: availableAgents[0]!.id,
          tenantId: input.tenantId,
        });

        if (assigned.success && assigned.handoff) {
          await this.notifyAgent(assigned.handoff.id);
          return { success: true, handoff: assigned.handoff };
        }
      }

      return { success: true, handoff };
    } catch (error) {
      console.error('[HandoffService] requestHandoff error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error requesting handoff',
      };
    }
  }

  // -----------------------------------------------------------------------
  // assignHandoff — Assign a handoff to a human agent
  // -----------------------------------------------------------------------

  async assignHandoff(
    input: AssignHandoffInput,
  ): Promise<{ success: boolean; handoff?: HandoffRequest; error?: string }> {
    try {
      const handoff = handoffs.get(input.handoffId);
      if (!handoff) {
        return { success: false, error: 'Handoff not found' };
      }

      if (handoff.status !== 'pending') {
        return {
          success: false,
          error: `Handoff is already ${handoff.status}. Only pending handoffs can be assigned.`,
        };
      }

      // Verify agent exists
      const agent = agents.get(input.agentId);
      if (!agent) {
        return { success: false, error: 'Agent not found' };
      }

      handoff.status = 'assigned';
      handoff.assignedTo = input.agentId;
      handoff.assignedAt = new Date().toISOString();
      handoff.updatedAt = new Date().toISOString();

      handoffs.set(input.handoffId, handoff);

      // Update agent's active session count
      agent.activeSessions += 1;
      agent.lastActiveAt = new Date().toISOString();
      agents.set(input.agentId, agent);

      return { success: true, handoff };
    } catch (error) {
      console.error('[HandoffService] assignHandoff error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error assigning handoff',
      };
    }
  }

  // -----------------------------------------------------------------------
  // getAvailableAgents — Find online agents for a tenant
  // -----------------------------------------------------------------------

  async getAvailableAgents(tenantId: string): Promise<ChatAgent[]> {
    const available = Array.from(agents.values()).filter((agent) => {
      if (agent.tenantId !== tenantId) return false;
      if (!agent.isOnline) return false;
      if (agent.activeSessions >= agent.maxSessions) return false;
      return true;
    });

    // Sort by least busy first
    available.sort((a, b) => a.activeSessions - b.activeSessions);

    return available;
  }

  // -----------------------------------------------------------------------
  // getHandoffStatus — Check status of a handoff request
  // -----------------------------------------------------------------------

  async getHandoffStatus(
    handoffId: string,
  ): Promise<{ success: boolean; handoff?: HandoffRequest; error?: string }> {
    const handoff = handoffs.get(handoffId);
    if (!handoff) {
      return { success: false, error: 'Handoff not found' };
    }
    return { success: true, handoff };
  }

  // -----------------------------------------------------------------------
  // notifyAgent — Notify an agent about an assigned handoff
  // -----------------------------------------------------------------------

  async notifyAgent(handoffId: string): Promise<boolean> {
    try {
      const handoff = handoffs.get(handoffId);
      if (!handoff || !handoff.assignedTo) {
        console.warn('[HandoffService] Cannot notify: handoff not found or unassigned');
        return false;
      }

      const agent = agents.get(handoff.assignedTo);
      if (!agent) {
        console.warn('[HandoffService] Cannot notify: agent not found');
        return false;
      }

      console.log('[HandoffService] Notifying agent:', {
        agentId: agent.id,
        agentName: agent.name,
        handoffId,
        sessionId: handoff.sessionId,
        reason: handoff.reason,
        phoneNumber: handoff.phoneNumber,
      });

      // In production, this would:
      // 1. Send in-app notification
      // 2. Send push notification
      // 3. Send email/SMS alert
      // 4. Update WebSocket for real-time UI

      return true;
    } catch (error) {
      console.error('[HandoffService] notifyAgent error:', error);
      return false;
    }
  }

  // -----------------------------------------------------------------------
  // closeHandoff — Close/resolve a handoff request
  // -----------------------------------------------------------------------

  async closeHandoff(
    handoffId: string,
    resolution?: string,
  ): Promise<{ success: boolean; handoff?: HandoffRequest; error?: string }> {
    try {
      const handoff = handoffs.get(handoffId);
      if (!handoff) {
        return { success: false, error: 'Handoff not found' };
      }

      if (handoff.status === 'resolved' || handoff.status === 'cancelled') {
        return {
          success: false,
          error: `Handoff is already ${handoff.status}`,
        };
      }

      handoff.status = resolution === 'cancelled' ? 'cancelled' : 'resolved';
      handoff.resolvedAt = new Date().toISOString();
      handoff.updatedAt = new Date().toISOString();
      handoff.metadata = {
        ...handoff.metadata,
        resolution,
      };

      handoffs.set(handoffId, handoff);

      // Decrement agent's active session count if assigned
      if (handoff.assignedTo) {
        const agent = agents.get(handoff.assignedTo);
        if (agent) {
          agent.activeSessions = Math.max(0, agent.activeSessions - 1);
          agent.lastActiveAt = new Date().toISOString();
          agents.set(handoff.assignedTo, agent);
        }
      }

      return { success: true, handoff };
    } catch (error) {
      console.error('[HandoffService] closeHandoff error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error closing handoff',
      };
    }
  }

  // -----------------------------------------------------------------------
  // Agent Management
  // -----------------------------------------------------------------------

  registerAgent(agent: ChatAgent): void {
    agents.set(agent.id, {
      ...agent,
      lastActiveAt: new Date().toISOString(),
    });
  }

  unregisterAgent(agentId: string): void {
    agents.delete(agentId);
  }

  setAgentOnline(agentId: string, isOnline: boolean): void {
    const agent = agents.get(agentId);
    if (agent) {
      agent.isOnline = isOnline;
      agent.lastActiveAt = new Date().toISOString();
      agents.set(agentId, agent);
    }
  }

  getAgent(agentId: string): ChatAgent | undefined {
    return agents.get(agentId);
  }

  getAllAgents(tenantId?: string): ChatAgent[] {
    if (tenantId) {
      return Array.from(agents.values()).filter((a) => a.tenantId === tenantId);
    }
    return Array.from(agents.values());
  }

  // -----------------------------------------------------------------------
  // Handoff Queries
  // -----------------------------------------------------------------------

  listHandoffs(
    options: {
      tenantId?: string;
      status?: HandoffStatus;
      sessionId?: string;
      assignedTo?: string;
      limit?: number;
      offset?: number;
    } = {},
  ): HandoffRequest[] {
    let results = Array.from(handoffs.values());

    if (options.tenantId) {
      results = results.filter((h) => h.tenantId === options.tenantId);
    }
    if (options.status) {
      results = results.filter((h) => h.status === options.status);
    }
    if (options.sessionId) {
      results = results.filter((h) => h.sessionId === options.sessionId);
    }
    if (options.assignedTo) {
      results = results.filter((h) => h.assignedTo === options.assignedTo);
    }

    // Sort by newest first
    results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const limit = options.limit ?? 50;
    const offset = options.offset ?? 0;
    return results.slice(offset, offset + limit);
  }

  getHandoffById(handoffId: string): HandoffRequest | undefined {
    return handoffs.get(handoffId);
  }

  getPendingHandoffForSession(sessionId: string): HandoffRequest | undefined {
    return Array.from(handoffs.values()).find(
      (h) => h.sessionId === sessionId && (h.status === 'pending' || h.status === 'assigned'),
    );
  }

  // -----------------------------------------------------------------------
  // Stats
  // -----------------------------------------------------------------------

  getStats(tenantId: string): {
    total: number;
    pending: number;
    assigned: number;
    resolved: number;
    cancelled: number;
  } {
    const tenantHandoffs = Array.from(handoffs.values()).filter(
      (h) => h.tenantId === tenantId,
    );

    return {
      total: tenantHandoffs.length,
      pending: tenantHandoffs.filter((h) => h.status === 'pending').length,
      assigned: tenantHandoffs.filter((h) => h.status === 'assigned').length,
      resolved: tenantHandoffs.filter((h) => h.status === 'resolved').length,
      cancelled: tenantHandoffs.filter((h) => h.status === 'cancelled').length,
    };
  }

  // -----------------------------------------------------------------------
  // Static factory
  // -----------------------------------------------------------------------

  static create(): HandoffService {
    return new HandoffService();
  }
}
