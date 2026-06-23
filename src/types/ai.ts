// ============================================================================
// EstateFlow CRM — AI Voice Provider Type Definitions
// Phase 3 — AI Voice Agent (AGENT-3-1-PROVIDER-ADAPTER)
// ============================================================================

// ---------------------------------------------------------------------------
// Call Status Enum
// ---------------------------------------------------------------------------

export enum AICallStatus {
  Queued = 'queued',
  Ringing = 'ringing',
  InProgress = 'in_progress',
  Completed = 'completed',
  Failed = 'failed',
  NoAnswer = 'no_answer',
  Busy = 'busy',
  Cancelled = 'cancelled',
}

// ---------------------------------------------------------------------------
// Call Outcome
// ---------------------------------------------------------------------------

export type CallOutcome =
  | 'interested'
  | 'not_interested'
  | 'callback'
  | 'site_visit'
  | 'wrong_number'
  | 'no_answer';

// ---------------------------------------------------------------------------
// Provider Names
// ---------------------------------------------------------------------------

export type AIProviderName = 'bland_ai' | 'retell_ai' | 'vapi';

// ---------------------------------------------------------------------------
// Call Parameters
// ---------------------------------------------------------------------------

export interface AICallParams {
  /** Phone number to dial (E.164 format) */
  to: string;
  /** Script or prompt for the AI agent */
  script: string;
  /** Voice ID or name for the AI agent */
  voice?: string;
  /** Language code (e.g. 'en', 'hi', 'es') */
  language?: string;
  /** Maximum call duration in seconds */
  maxDuration?: number;
  /** Tenant UUID */
  tenantId: string;
  /** Lead UUID (optional) */
  leadId?: string;
  /** AI Agent UUID (optional) */
  agentId?: string;
  /** Call type / purpose identifier */
  callType?: string;
  /** Arbitrary metadata passed through to the provider */
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Call Result
// ---------------------------------------------------------------------------

export interface AICallResult {
  /** Provider-internal call ID */
  callId: string;
  /** Current status of the call */
  status: AICallStatus;
  /** Provider name that handled the call */
  provider: AIProviderName;
  /** Human-readable message */
  message?: string;
}

// ---------------------------------------------------------------------------
// Provider Configuration
// ---------------------------------------------------------------------------

export interface ProviderConfig {
  /** API key / auth token for the provider */
  apiKey: string;
  /** Optional custom base URL (for self-hosted / proxy setups) */
  baseUrl?: string;
  /** Webhook URL for receiving call events from the provider */
  webhookUrl?: string;
}

// ---------------------------------------------------------------------------
// Call Status Response (generic across providers)
// ---------------------------------------------------------------------------

export interface AICallStatusResponse {
  callId: string;
  status: AICallStatus;
  durationSeconds?: number;
  recordingUrl?: string | null;
  transcript?: string | null;
  sentiment?: string | null;
  outcome?: CallOutcome | null;
  error?: string | null;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Transcript Entry
// ---------------------------------------------------------------------------

export interface TranscriptEntry {
  role: 'agent' | 'user';
  text: string;
  timestamp?: number;
}

// ---------------------------------------------------------------------------
// Bland AI Webhook Payload
// ---------------------------------------------------------------------------

export interface BlandAIWebhookPayload {
  call_id: string;
  status: string;
  transcript?: string;
  recording_url?: string;
  metadata?: Record<string, unknown>;
  duration?: number;
  cost?: number;
  sentiment?: string;
  to?: string;
  from?: string;
  completed?: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Retell AI Webhook Payload
// ---------------------------------------------------------------------------

export interface RetellAIWebhookPayload {
  event: string;
  call_id: string;
  call_status: string;
  transcript?: string;
  recording_url?: string;
  duration_ms?: number;
  agent_id?: string;
  from_number?: string;
  to_number?: string;
  metadata?: Record<string, unknown>;
  disconnection_reason?: string;
}

// ---------------------------------------------------------------------------
// Vapi Webhook Payload
// ---------------------------------------------------------------------------

export interface VapiWebhookPayload {
  message?: {
    type: string;
    call_id: string;
    status?: string;
    transcript?: string;
    recording_url?: string;
    duration_seconds?: number;
    ended_reason?: string;
    cost?: number;
    phone_call_provider?: string;
  };
  call_id?: string;
  status?: string;
}

// ---------------------------------------------------------------------------
// AIVoiceProvider Interface
// ---------------------------------------------------------------------------

export interface AIVoiceProvider {
  /** Human-readable provider name */
  readonly name: AIProviderName;

  /**
   * Initiate an outbound AI voice call.
   * Returns a call result with the provider's call ID.
   */
  makeCall(params: AICallParams): Promise<AICallResult>;

  /**
   * Retrieve the current status of a call.
   */
  getCallStatus(callId: string): Promise<AICallStatusResponse>;

  /**
   * Get the recording URL for a completed call.
   */
  getRecording(callId: string): Promise<string | null>;

  /**
   * Get the transcript for a completed call.
   */
  getTranscript(callId: string): Promise<string | null>;

  /**
   * End/hang up an active call.
   */
  endCall(callId: string): Promise<AICallResult>;

  /**
   * Validate that the provider configuration is correct.
   * Returns { valid: true } or { valid: false, error: string }.
   */
  validateConfig(): Promise<{ valid: boolean; error?: string }>;
}

// ===========================================================================
// Agent Configuration Types — SaaS Owner & Client AI Agents
// Phase 3: AI Voice Agent — Agent Configuration System
// ===========================================================================

// ---------------------------------------------------------------------------
// SaaS Owner AI Agent
// ---------------------------------------------------------------------------

export interface SaaSAgentWorkingHours {
  start: string; // "09:00"
  end: string;   // "18:00"
  timezone: string; // "Asia/Kolkata"
}

export interface RetryPolicy {
  maxRetries: number;
  retryDelayMinutes: number;
  retryOnBusy: boolean;
  retryOnNoAnswer: boolean;
  retryOnFailed: boolean;
}

export interface SaaSOwnerAIAgent {
  id: string;
  name: string;
  voice: string;
  language: string;
  purpose: string;
  scriptTemplate: string;
  maxConcurrentCalls: number;
  workingHours: SaaSAgentWorkingHours;
  retryPolicy: RetryPolicy;
  created_at?: string;
  updated_at?: string;
}

// ---------------------------------------------------------------------------
// Client AI Agent
// ---------------------------------------------------------------------------

export interface AgentBehavior {
  callDelayMinutes: number;
  maxCallDuration: number; // seconds
  maxRetries: number;
  transferToHuman: TransferToHumanConfig;
  offers: OffersConfig;
}

export interface TransferToHumanConfig {
  budgetThreshold: number;
  angerDetected: boolean;
  complexQuestion: boolean;
}

export interface OffersConfig {
  maxDiscount: number; // percentage, e.g. 5 for 5%
  canOfferParking: boolean;
  canOfferFurniture: boolean;
  canOfferMaintenance: boolean;
}

export interface ScriptTemplateSet {
  firstContact: string;
  followUp: string;
  siteVisitConfirm: string;
  postVisit: string;
  negotiation: string;
  reEngagement: string;
}

export interface ClientAIAgentStats {
  currentCalls: number;
  totalCallsMade: number;
  totalCallsConnected: number;
  avgCallDuration: number | null;
  conversionRate: number | null;
}

export interface ClientAIAgent {
  id: string;
  tenantId: string;
  name: string;
  voice: string;
  language: string;
  greeting: string;
  purpose?: string;
  scriptTemplates: ScriptTemplateSet;
  behavior: AgentBehavior;
  status: 'active' | 'inactive' | 'paused' | 'error';
  currentCalls: number;
  totalCalls: number;
  stats?: ClientAIAgentStats;
  created_at?: string;
  updated_at?: string;
}

// ---------------------------------------------------------------------------
// API input types
// ---------------------------------------------------------------------------

export interface CreateAgentInput {
  name: string;
  voice?: string;
  language?: string;
  greeting?: string;
  scriptTemplates?: ScriptTemplateSet;
  behavior?: Partial<AgentBehavior>;
  maxConcurrentCalls?: number;
  purpose?: string;
}

export interface UpdateAgentInput {
  name?: string;
  voice?: string;
  language?: string;
  greeting?: string;
  scriptTemplates?: Partial<ScriptTemplateSet>;
  behavior?: Partial<AgentBehavior>;
  status?: 'active' | 'inactive' | 'paused' | 'error';
  maxConcurrentCalls?: number;
  purpose?: string;
}

export interface AgentWorkload {
  agentId: string;
  currentCalls: number;
  maxConcurrentCalls: number;
  availableSlots: number;
  utilizationPercent: number;
  status: string;
}
