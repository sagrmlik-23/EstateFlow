// ============================================================================
// EstateFlow CRM — Communication Type Definitions
// Phase 4 — Communication (AGENT-4-1-VOICE-ADAPTER + AGENT-4-2-WHATSAPP-SMS)
// ============================================================================

// ---------------------------------------------------------------------------
// Provider Names
// ---------------------------------------------------------------------------

export type VoiceProviderName = 'exotel' | 'twilio';

// ---------------------------------------------------------------------------
// Call Params
// ---------------------------------------------------------------------------

export interface CallParams {
  to: string;
  from?: string;
  script?: string;
  voice?: string;
  language?: string;
  maxDuration?: number;
  tenantId: string;
  leadId?: string;
  agentId?: string;
  callType?: string;
  twiml?: string;
  url?: string;
  record?: boolean;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Call Result
// ---------------------------------------------------------------------------

export interface CallResult {
  callSid: string;
  status: string;
  duration?: number;
  price?: number;
  provider: VoiceProviderName;
  message?: string;
  error?: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Provider Configuration
// ---------------------------------------------------------------------------

export interface ProviderConfig {
  apiKey: string;
  apiSecret: string;
  accountSid?: string;
  fromNumber?: string;
  baseUrl?: string;
  webhookUrl?: string;
}

// ---------------------------------------------------------------------------
// Call Status Response
// ---------------------------------------------------------------------------

export interface CallStatusResponse {
  callSid: string;
  status: string;
  durationSeconds?: number;
  recordingUrl?: string | null;
  transcription?: string | null;
  price?: number;
  direction?: 'inbound' | 'outbound';
  from?: string;
  to?: string;
  error?: string | null;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Webhook Result
// ---------------------------------------------------------------------------

export interface WebhookResult {
  callSid: string;
  status: string;
  recordingUrl: string | null;
  duration?: number;
  price?: number;
  direction?: 'inbound' | 'outbound';
  from?: string;
  to?: string;
  transcription?: string | null;
  error?: string | null;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Dry-Run Config
// ---------------------------------------------------------------------------

export interface DryRunConfig {
  mode: boolean;
  logPath?: string;
  simulateResponse?: string;
}

// ---------------------------------------------------------------------------
// Feature Flags (tenant-level voice settings)
// ---------------------------------------------------------------------------

export interface VoiceFeatureFlags {
  voiceEnabled: boolean;
  dryRunEnabled: boolean;
  preferredProvider: VoiceProviderName;
  recordingEnabled: boolean;
  transcriptionEnabled: boolean;
}

// ---------------------------------------------------------------------------
// CommunicationProvider Interface
// ---------------------------------------------------------------------------

export interface CommunicationProvider {
  readonly name: VoiceProviderName;

  makeCall(params: CallParams): Promise<CallResult>;
  getCallStatus(callSid: string): Promise<CallStatusResponse>;
  getRecording(callSid: string): Promise<string | null>;
  transcribe(callSid: string): Promise<string | null>;
  validateConfig(): Promise<{ valid: boolean; error?: string }>;
  handleCallback(payload: Record<string, unknown>): WebhookResult;
}

// ---------------------------------------------------------------------------
// Call Record (DB model for the calls table)
// ---------------------------------------------------------------------------

export interface CallRecord {
  id: string;
  tenantId: string;
  leadId: string | null;
  agentId: string | null;
  callerPhone: string | null;
  calleePhone: string | null;
  direction: 'inbound' | 'outbound';
  durationSeconds: number | null;
  status: string;
  recordingUrl: string | null;
  provider: VoiceProviderName | null;
  providerCallSid: string | null;
  price: number | null;
  notes: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Message Channel Types
// ---------------------------------------------------------------------------

export type MessageChannel = 'whatsapp' | 'sms' | 'email' | 'in_app' | 'web';

export type MessageDirection = 'outbound' | 'inbound';

export type MessageStatus = 'queued' | 'sent' | 'delivered' | 'read' | 'failed';

export interface MessageRecord {
  id: string;
  tenant_id: string;
  lead_id: string | null;
  channel: MessageChannel;
  direction: MessageDirection;
  content: string | null;
  media_urls: string[] | null;
  status: MessageStatus;
  template_id: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Notification Types
// ---------------------------------------------------------------------------

export type NotificationType =
  | 'lead_notification'
  | 'property_share'
  | 'appointment_reminder'
  | 'follow_up'
  | 'otp';

export interface LeadNotificationData {
  leadId: string;
  fullName: string;
  phone?: string;
  email?: string;
  source?: string;
  propertyType?: string;
  budgetRange?: string;
  preferredLocation?: string;
}

export interface PropertyShareData {
  propertyId: string;
  title: string;
  price: number;
  location: string;
  bedrooms?: number;
  area?: number;
  imageUrl?: string;
}

export interface AppointmentReminderData {
  appointmentId: string;
  leadName: string;
  propertyTitle: string;
  dateTime: string;
  location: string;
  notes?: string;
}

export interface FollowUpData {
  leadId: string;
  fullName: string;
  daysSinceContact: number;
  lastNote?: string;
}
