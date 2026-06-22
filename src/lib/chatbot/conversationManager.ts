// ============================================================================
// EstateFlow CRM — Conversation Manager
// Phase 5 — AI Chatbot (AGENT-5-1-CHATBOT-ENGINE)
// ============================================================================
//
// Orchestrates the full message pipeline: NLU → response generation → actions.
// Manages session lifecycle, context accumulation, lead creation, and handoff.
// Sessions stored in-memory for MVP (Redis for production).
// ============================================================================

import { processNLU } from './nlu';
import { generateResponse, generateFallbackResponse } from './responseGenerator';
import { searchProperties, scheduleVisit, connectToAgent, createLeadFromChat } from './actions';
import { createOrUpdateLead } from './leadCapture';
import type {
  ChatSession,
  EngineChatMessage,
  ChatContext,
  ChatChannel,
  ChatIntent,
  EngineBotResponse,
  NLUResult,
} from '@/types/chatbot';

// ============================================================================
// In-Memory Store (MVP — replace with Redis/DB in production)
// ============================================================================

const sessions = new Map<string, ChatSession>();

// ============================================================================
// Constants
// ============================================================================

const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 min idle timeout
const MAX_TURNS_BEFORE_HANDOFF_SUGGEST = 8;
const MAX_TURNS_BEFORE_FORCE_HANDOFF = 20;

// ============================================================================
// ConversationManager
// ============================================================================

export class ConversationManager {
  // -------------------------------------------------------------------------
  // createSession — Create a new chat session
  // -------------------------------------------------------------------------

  /**
   * Create a new chat session for a tenant/channel combination.
   *
   * @param tenantId - Tenant UUID
   * @param channel  - Communication channel (website, whatsapp, etc.)
   * @param leadId   - Optional lead UUID to associate
   * @returns The newly created session
   */
  createSession(tenantId: string, channel: ChatChannel, leadId?: string): ChatSession {
    const id = crypto.randomUUID();
    const now = Date.now();

    const session: ChatSession = {
      id,
      tenantId,
      channel,
      leadId,
      messages: [],
      context: {
        turnCount: 0,
        missingInfo: ['location', 'budget', 'name', 'phone'],
      },
      startedAt: now,
      lastActivityAt: now,
      status: 'active',
    };

    sessions.set(id, session);

    // Add system welcome message
    const welcomeMessage: EngineChatMessage = {
      id: crypto.randomUUID(),
      role: 'system',
      content: 'Session started',
      timestamp: now,
    };
    session.messages.push(welcomeMessage);

    console.log(`[ConversationManager] Session created: ${id} for tenant ${tenantId} via ${channel}`);
    return session;
  }

  // -------------------------------------------------------------------------
  // getSession — Get a session by id
  // -------------------------------------------------------------------------

  /**
   * Retrieve a session by its ID.
   * Returns null if not found.
   */
  getSession(sessionId: string): ChatSession | null {
    return sessions.get(sessionId) ?? null;
  }

  // -------------------------------------------------------------------------
  // addMessage — Add a message to a session
  // -------------------------------------------------------------------------

  /**
   * Append a message to the session's message history.
   * Updates lastActivityAt timestamp.
   *
   * @param sessionId - Session UUID
   * @param message   - Message to add
   * @returns true if successful, false if session not found
   */
  addMessage(sessionId: string, message: Omit<EngineChatMessage, 'id' | 'timestamp'>): boolean {
    const session = sessions.get(sessionId);
    if (!session) return false;

    const fullMessage: EngineChatMessage = {
      ...message,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    };

    session.messages.push(fullMessage);
    session.lastActivityAt = Date.now();

    return true;
  }

  // -------------------------------------------------------------------------
  // processMessage — Main pipeline: NLU → response → actions
  // -------------------------------------------------------------------------

  /**
   * Process a user message through the full chatbot pipeline:
   *   1. Add user message to session
   *   2. Run NLU (intent classification + entity extraction)
   *   3. Update session context with extracted entities
   *   4. Generate response based on intent + context
   *   5. Execute any actions (search, schedule, etc.)
   *   6. Add bot response to session
   *   7. Return the bot response
   *
   * @param sessionId - Session UUID
   * @param message   - Raw user message text
   * @returns EngineBotResponse with text, suggestions, and actions
   */
  async processMessage(sessionId: string, message: string): Promise<EngineBotResponse> {
    const session = sessions.get(sessionId);
    if (!session) {
      return {
        text: 'Session not found. Kripya dubara baat shuru karein. 🙏',
        intent: 'general_query',
        confidence: 0,
        handoffSuggested: false,
      };
    }

    // ── Step 1: Add user message ──────────────────────────────────────────
    this.addMessage(sessionId, {
      role: 'user',
      content: message,
    });

    // ── Step 2: Run NLU ───────────────────────────────────────────────────
    const nluResult: NLUResult = processNLU(message);

    // ── Step 3: Update session context with extracted entities ────────────
    this.updateContext(session, nluResult);

    // ── Step 4: Check for forced handoff ─────────────────────────────────
    if (session.context.turnCount >= MAX_TURNS_BEFORE_FORCE_HANDOFF) {
      const handoffResponse: EngineBotResponse = {
        text: 'Aapse baat karke bahut achha laga! 🎯 Lagta hai aapko kuch specific chahiye. Main aapko ek human agent se connect kar raha hoon jo aapki aur madad kar sakta hai.',
        intent: 'handoff',
        confidence: 1,
        suggestions: ['Call me', 'WhatsApp', 'Schedule callback'],
        handoffSuggested: true,
        actions: [{ type: 'connect_agent', payload: { reason: 'Max turns reached', context: session.context } }],
      };

      this.addEngineBotResponse(session, handoffResponse);
      this.updateLastIntent(session, 'handoff');
      return handoffResponse;
    }

    // ── Step 5: Generate response ─────────────────────────────────────────
    let response: EngineBotResponse;

    if (nluResult.confidence >= 0.15) {
      response = generateResponse(nluResult, session.context);
    } else if (session.context.turnCount > 0) {
      response = generateFallbackResponse(session.context);
    } else {
      // First message with low confidence — give general greeting
      response = generateResponse(
        { ...nluResult, intent: 'greeting', confidence: 0.8 },
        session.context,
      );
    }

    // ── Step 6: Execute actions ───────────────────────────────────────────
    if (response.actions && response.actions.length > 0) {
      await this.executeActions(session, response.actions);
    }

    // ── Step 7: Update session state ─────────────────────────────────────
    this.addEngineBotResponse(session, response);
    this.updateLastIntent(session, nluResult.intent);

    return response;
  }

  // -------------------------------------------------------------------------
  // getContext — Get current conversation context
  // -------------------------------------------------------------------------

  /**
   * Get the accumulated context from a session.
   * Returns null if session not found.
   */
  getContext(sessionId: string): ChatContext | null {
    const session = sessions.get(sessionId);
    return session?.context ?? null;
  }

  // -------------------------------------------------------------------------
  // updateLeadFromChat — Create/update lead from chat context
  // -------------------------------------------------------------------------

  /**
   * Extract lead information from chat messages and create/update a lead.
   * Returns the lead ID if successful, null otherwise.
   */
  async updateLeadFromChat(sessionId: string): Promise<string | null> {
    const session = sessions.get(sessionId);
    if (!session) return null;

    const leadInfo = await createOrUpdateLead(
      session.tenantId,
      {
        name: session.context.name,
        phone: session.context.phone,
        email: session.context.email,
        propertyType: session.context.propertyType,
        location: session.context.location,
        budgetMin: session.context.budget?.min,
        budgetMax: session.context.budget?.max,
        bedrooms: session.context.bedrooms,
        notes: `Auto-created from chatbot session ${sessionId}`,
      },
      sessionId,
    );

    if (leadInfo?.id) {
      session.leadId = leadInfo.id;
    }

    return leadInfo?.id ?? null;
  }

  // -------------------------------------------------------------------------
  // endSession — End a session
  // -------------------------------------------------------------------------

  /**
   * End a chat session, optionally creating a lead from the context.
   *
   * @param sessionId - Session UUID
   * @param createLead - Whether to auto-create a lead
   */
  async endSession(sessionId: string, createLead: boolean = false): Promise<boolean> {
    const session = sessions.get(sessionId);
    if (!session) return false;

    if (createLead && session.context.name && session.context.phone) {
      await this.updateLeadFromChat(sessionId);
    }

    session.status = 'closed';
    session.lastActivityAt = Date.now();

    console.log(`[ConversationManager] Session ended: ${sessionId}`);
    return true;
  }

  // -------------------------------------------------------------------------
  // shouldHandoff — Determine if human handoff needed
  // -------------------------------------------------------------------------

  /**
   * Check if the conversation should be handed off to a human agent.
   *
   * Handoff triggers:
   *   - User explicitly requested handoff (intent === 'handoff')
   *   - Max turns reached
   *   - Low confidence for 3+ consecutive turns
   *   - Session was idle for too long
   *
   * @param sessionId - Session UUID
   * @returns Reason for handoff, or null if not needed
   */
  shouldHandoff(sessionId: string): string | null {
    const session = sessions.get(sessionId);
    if (!session) return null;

    // User requested handoff
    if (session.context.lastIntent === 'handoff') {
      return 'User requested human agent';
    }

    // Max turns
    if (session.context.turnCount >= MAX_TURNS_BEFORE_HANDOFF_SUGGEST) {
      return 'Conversation exceeded max turns';
    }

    // Idle timeout
    const idleTime = Date.now() - session.lastActivityAt;
    if (idleTime > SESSION_TIMEOUT_MS && session.context.turnCount > 0) {
      return 'Session idle timeout';
    }

    return null;
  }

  // -------------------------------------------------------------------------
  // getSessionStats — Get aggregate session stats
  // -------------------------------------------------------------------------

  /**
   * Get summary statistics about all sessions for a tenant.
   */
  getSessionStats(tenantId: string): {
    total: number;
    active: number;
    closed: number;
    handoffRequested: number;
    leadsCreated: number;
  } {
    let total = 0;
    let active = 0;
    let closed = 0;
    let handoffRequested = 0;
    let leadsCreated = 0;

    const allSessions = Array.from(sessions.values());
    for (const session of allSessions) {
      if (session.tenantId !== tenantId) continue;
      total++;
      if (session.status === 'active') active++;
      if (session.status === 'closed') closed++;
      if (session.status === 'handoff_requested' || session.status === 'handoff_completed') handoffRequested++;
      if (session.leadId) leadsCreated++;
    }

    return { total, active, closed, handoffRequested, leadsCreated };
  }

  // -------------------------------------------------------------------------
  // cleanupIdleSessions — Remove stale sessions
  // -------------------------------------------------------------------------

  /**
   * Clean up sessions that have been idle beyond the timeout.
   * Called periodically or on demand.
   */
  cleanupIdleSessions(): number {
    const now = Date.now();
    let cleaned = 0;

    const entries = Array.from(sessions.entries());
    for (const [id, session] of entries) {
      if (session.status === 'closed') {
        sessions.delete(id);
        cleaned++;
        continue;
      }

      const idleTime = now - session.lastActivityAt;
      if (idleTime > SESSION_TIMEOUT_MS * 2) { // 60 min for hard cleanup
        sessions.delete(id);
        cleaned++;
      }
    }

    return cleaned;
  }

  // -------------------------------------------------------------------------
  // Static factory
  // -------------------------------------------------------------------------

  static create(): ConversationManager {
    return new ConversationManager();
  }

  // =========================================================================
  // Private Helpers
  // =========================================================================

  /**
   * Update session context with entities extracted from NLU.
   */
  private updateContext(session: ChatSession, nluResult: NLUResult): void {
    const ctx = session.context;
    const e = nluResult.entities;

    ctx.turnCount++;

    // Accumulate entities into context
    if (e.budget) {
      const budgetVal = e.budget.value as number;
      ctx.budget = {
        min: ctx.budget?.min ?? budgetVal * 0.7,
        max: Math.max(ctx.budget?.max ?? 0, budgetVal),
        raw: e.budget.text,
      };
    }

    if (e.location) {
      ctx.location = e.location.value as string;
    }

    if (e.propertyType) {
      ctx.propertyType = e.propertyType.value as string;
    }

    if (e.bedrooms) {
      ctx.bedrooms = e.bedrooms.value as number;
    }

    if (e.timeline) {
      ctx.timeline = e.timeline.value as string;
    }

    if (e.name) {
      ctx.name = e.name.value as string;
    }

    if (e.phone) {
      ctx.phone = e.phone.value as string;
    }

    if (e.email) {
      ctx.email = e.email.value as string;
    }

    // Update missing info list
    ctx.missingInfo = [];
    if (!ctx.location) ctx.missingInfo.push('location');
    if (!ctx.budget) ctx.missingInfo.push('budget');
    if (!ctx.bedrooms && !ctx.propertyType) ctx.missingInfo.push('propertyType');
    if (!ctx.name) ctx.missingInfo.push('name');
    if (!ctx.phone) ctx.missingInfo.push('phone');

    // Save updated session
    sessions.set(session.id, session);
  }

  /**
   * Add a bot response message to the session (using engine type).
   */
  private addEngineBotResponse(session: ChatSession, response: EngineBotResponse): void {
    const botMessage: EngineChatMessage = {
      id: crypto.randomUUID(),
      role: 'bot',
      content: response.text,
      timestamp: Date.now(),
      metadata: {
        intent: response.intent,
        confidence: response.confidence,
        suggestions: response.suggestions,
        handoffSuggested: response.handoffSuggested,
      },
    };

    session.messages.push(botMessage);
    session.lastActivityAt = Date.now();
    sessions.set(session.id, session);
  }

  /**
   * Update the last intent in session context.
   */
  private updateLastIntent(session: ChatSession, intent: ChatIntent): void {
    session.context.lastIntent = intent;
    sessions.set(session.id, session);
  }

  /**
   * Execute any actions returned by the response generator.
   */
  private async executeActions(
    session: ChatSession,
    actions: EngineBotResponse['actions'],
  ): Promise<void> {
    if (!actions) return;

    for (const action of actions) {
      try {
        switch (action.type) {
          case 'search_properties': {
            const results = await searchProperties(action.payload);
            console.log(`[ConversationManager] search_properties: ${(results as unknown[])?.length ?? 0} results`);
            break;
          }

          case 'schedule_visit': {
            const result = await scheduleVisit(
              session.leadId ?? '',
              (action.payload.propertyId as string) ?? '',
              (action.payload.date as string) ?? '',
              (action.payload.time as string) ?? '',
            );
            console.log(`[ConversationManager] schedule_visit: ${result ? 'scheduled' : 'failed'}`);
            break;
          }

          case 'send_details': {
            console.log(`[ConversationManager] send_details: triggered for lead ${session.leadId}`);
            break;
          }

          case 'connect_agent': {
            const result = await connectToAgent(
              session.leadId ?? session.id,
              (action.payload.reason as string) ?? 'User requested',
            );
            if (result) {
              session.status = 'handoff_requested';
              sessions.set(session.id, session);
            }
            console.log(`[ConversationManager] connect_agent: ${result ? 'requested' : 'failed'}`);
            break;
          }

          case 'create_lead': {
            const leadId = await createLeadFromChat(session.context);
            if (leadId) {
              session.leadId = leadId;
              sessions.set(session.id, session);
            }
            console.log(`[ConversationManager] create_lead: ${leadId ? `lead ${leadId}` : 'failed'}`);
            break;
          }
        }
      } catch (error) {
        console.error(`[ConversationManager] Action ${action.type} failed:`, error);
      }
    }
  }
}
