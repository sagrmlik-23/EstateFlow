// ============================================================================
// EstateFlow CRM — Chatbot Type Definitions
// Phase 5 — AI Chatbot (AGENT-5-1-CHATBOT-ENGINE + AGENT-5-2-WEBSITE-WIDGET)
// ============================================================================
//
// Unified types for the chatbot engine, website widget, WhatsApp bot,
// and handoff service. All chatbot-related types live here.
// ============================================================================

// ============================================================================
// SECTION 1 — Widget Configuration (AGENT-5-2-WEBSITE-WIDGET)
// ============================================================================

export interface WidgetConfig {
  tenantId: string;
  botName: string;
  themeColor: string;
  welcomeMessage: string;
  position: 'right' | 'left';
  icon: 'chat' | 'bubble' | 'robot' | 'message';
  allowedPages: string[];
  enabled: boolean;
}

export interface WidgetConfigInput {
  botName?: string;
  themeColor?: string;
  welcomeMessage?: string;
  position?: 'right' | 'left';
  icon?: WidgetConfig['icon'];
  allowedPages?: string[];
  enabled?: boolean;
}

// ============================================================================
// SECTION 2 — Widget Chat Sessions (AGENT-5-2-WEBSITE-WIDGET)
// ============================================================================

/** Widget-level chat session (website visitor tracking) */
export interface WidgetChatSession {
  sessionId: string;
  tenantId: string;
  visitorId?: string;
  visitorName?: string;
  visitorEmail?: string;
  visitorPhone?: string;
  metadata?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
}

export interface AnonymousSession {
  sessionId: string;
  createdAt: string;
  visitorId: string;
}

// ============================================================================
// SECTION 3 — Widget Messages & Rich Media (AGENT-5-2-WEBSITE-WIDGET)
// ============================================================================

export type MessageRole = 'user' | 'bot' | 'system';

export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';

/** Widget-level chat message */
export interface WidgetChatMessage {
  id: string;
  sessionId: string;
  role: MessageRole;
  content: string;
  richCard?: RichCardData | null;
  quickReplies?: string[];
  status: MessageStatus;
  timestamp: string;
}

export interface RichCardData {
  type: 'property' | 'link' | 'contact' | 'appointment';
  data: PropertyCardData | LinkCardData | ContactCardData | AppointmentCardData;
}

export interface PropertyCardData {
  propertyId: string;
  title: string;
  price: number;
  location: string;
  type: string;
  imageUrl?: string;
  bedrooms?: number;
  area?: number;
  status?: string;
}

export interface LinkCardData {
  url: string;
  title: string;
  description?: string;
  imageUrl?: string;
}

export interface ContactCardData {
  name: string;
  phone?: string;
  email?: string;
  role?: string;
}

export interface AppointmentCardData {
  appointmentId: string;
  date: string;
  time: string;
  location: string;
  notes?: string;
}

/** Widget-level bot response */
export interface WidgetBotResponse {
  message: string;
  richCard?: RichCardData | null;
  quickReplies?: string[];
  suggestedActions?: SuggestedAction[];
  sessionId?: string;
}

export interface SuggestedAction {
  label: string;
  action: string;
  type: 'url' | 'phone' | 'appointment' | 'property_search' | 'contact';
  data?: Record<string, string>;
}

// ============================================================================
// SECTION 4 — Widget Embed (AGENT-5-2-WEBSITE-WIDGET)
// ============================================================================

export interface EmbedScriptConfig {
  tenantId: string;
  botName: string;
  themeColor: string;
  welcomeMessage: string;
  position: 'right' | 'left';
  icon: WidgetConfig['icon'];
  baseUrl?: string;
}

export interface EmbedScriptResult {
  scriptTag: string;
  htmlCode: string;
  iframeCode: string;
}

export interface WidgetMessageRequest {
  sessionId?: string;
  tenantId: string;
  message: string;
  visitorId?: string;
}

export interface WidgetMessageResponse {
  sessionId: string;
  response: WidgetBotResponse;
}

export interface WidgetConfigResponse extends WidgetConfig {
  exists: boolean;
}

// ============================================================================
// SECTION 5 — WhatsApp Chatbot Session (AGENT-5-3-WHATSAPP-CHATBOT)
// ============================================================================

export type ChatbotSessionStatus = ChatSessionStatus;

export interface ChatbotSession {
  id: string;
  phoneNumber: string;
  tenantId: string;
  status: ChatbotSessionStatus;
  language: string;
  lastMessageAt: string;
  createdAt: string;
}

export interface ChatbotMessage {
  id: string;
  sessionId: string;
  from: string;
  to: string;
  type: string;
  content: string;
  mediaUrl?: string;
  latitude?: number;
  longitude?: number;
  label?: string;
  buttonText?: string;
  timestamp: string;
  direction: 'inbound' | 'outbound';
  metadata?: Record<string, unknown>;
}

/** WhatsApp-level bot response */
export interface WhatsAppBotResponse {
  text: string;
  type: 'text' | 'image' | 'location';
  quickReplies?: string[];
  mediaUrl?: string;
  latitude?: number;
  longitude?: number;
  label?: string;
}

export interface ConversationContext {
  sessionId: string;
  phoneNumber: string;
  tenantId: string;
  language: string;
  turnCount: number;
  collectedData: Record<string, unknown>;
  metadata: Record<string, unknown>;
  lastIntent?: string;
}

// ============================================================================
// SECTION 6 — Handoff (AGENT-5-3-WHATSAPP-CHATBOT)
// ============================================================================

export type HandoffStatus = 'pending' | 'assigned' | 'resolved' | 'cancelled';

export type HandoffReason =
  | 'complex_query'
  | 'lead_quality'
  | 'complaint'
  | 'not_interested'
  | 'price_negotiation'
  | 'schedule_visit'
  | 'document_request'
  | 'other';

export interface HandoffRequest {
  id: string;
  sessionId: string;
  tenantId: string;
  phoneNumber: string;
  reason: HandoffReason;
  notes?: string;
  status: HandoffStatus;
  assignedTo?: string;
  assignedAt?: string;
  resolvedAt?: string;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface CreateHandoffInput {
  sessionId: string;
  phoneNumber: string;
  reason: HandoffReason;
  notes?: string;
  tenantId: string;
}

export interface AssignHandoffInput {
  handoffId: string;
  agentId: string;
  tenantId: string;
}

export interface ChatAgent {
  id: string;
  name: string;
  tenantId: string;
  isOnline: boolean;
  maxSessions: number;
  activeSessions: number;
  lastActiveAt: string;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// SECTION 7 — Chatbot Engine Types (AGENT-5-1-CHATBOT-ENGINE)
// ============================================================================

export interface ChatMedia {
  type: 'image' | 'video' | 'document' | 'location';
  url?: string;
  caption?: string;
  latitude?: number;
  longitude?: number;
  name?: string;
}

export interface EngineChatMessage {
  id: string;
  role: 'user' | 'bot' | 'system';
  content: string;
  timestamp: number;
  media?: ChatMedia;
  metadata?: Record<string, unknown>;
  // Widget compatibility aliases
  sessionId?: string;
  richCard?: RichCardData | null;
  quickReplies?: string[];
  status?: MessageStatus;
}

export type ChatChannel = 'website' | 'whatsapp' | 'sms' | 'facebook' | 'instagram';

export type ChatSessionStatus = 'active' | 'idle' | 'pending' | 'handoff_requested' | 'handoff_assigned' | 'handoff_completed' | 'closed';

export interface ChatContext {
  budget?: {
    min?: number;
    max?: number;
    raw?: string;
  };
  location?: string;
  propertyType?: string;
  bedrooms?: number;
  timeline?: string;
  name?: string;
  phone?: string;
  email?: string;
  preferences?: Record<string, string>;
  lastIntent?: ChatIntent;
  turnCount: number;
  missingInfo: string[];
}

export interface ChatSession {
  id: string;
  tenantId: string;
  userId?: string;
  leadId?: string;
  channel: ChatChannel;
  messages: EngineChatMessage[];
  context: ChatContext;
  startedAt: number;
  lastActivityAt: number;
  status: ChatSessionStatus;
  metadata?: Record<string, unknown>;
}

export type ChatIntent =
  | 'greeting'
  | 'property_search'
  | 'site_visit'
  | 'price_inquiry'
  | 'location_query'
  | 'contact_agent'
  | 'schedule_visit'
  | 'general_query'
  | 'handoff';

export interface WorkingHours {
  start: string;
  end: string;
  timezone: string;
  days: number[];
}

export interface ChatConfig {
  tenantId: string;
  welcomeMessage: string;
  themeColor: string;
  botName: string;
  fallbackMessage: string;
  workingHours: WorkingHours;
  handoffSchedule: WorkingHours;
  autoCreateLead: boolean;
  promptForContact: boolean;
  enabled: boolean;
}

export interface NLUEntity {
  text: string;
  value: string | number;
  confidence: number;
}

export interface NLUResult {
  intent: ChatIntent;
  confidence: number;
  entities: {
    budget?: NLUEntity;
    location?: NLUEntity;
    propertyType?: NLUEntity;
    bedrooms?: NLUEntity;
    timeline?: NLUEntity;
    name?: NLUEntity;
    phone?: NLUEntity;
    email?: NLUEntity;
  };
  originalQuery: string;
}

export interface EngineBotResponse {
  text: string;
  intent: ChatIntent;
  confidence: number;
  suggestions?: string[];
  richMedia?: BotRichMedia[];
  actions?: BotAction[];
  handoffSuggested?: boolean;
  metadata?: Record<string, unknown>;
  // WhatsApp bot compatibility fields
  type?: 'text' | 'image' | 'location';
  quickReplies?: string[];
  mediaUrl?: string;
  latitude?: number;
  longitude?: number;
  label?: string;
}

export type BotRichMediaType = 'property_card' | 'location' | 'quick_reply' | 'list' | 'button';

export interface BotRichMedia {
  type: BotRichMediaType;
  data: Record<string, unknown>;
}

export interface BotAction {
  type: 'search_properties' | 'schedule_visit' | 'send_details' | 'connect_agent' | 'create_lead';
  payload: Record<string, unknown>;
}

export interface HandoffEngineRequest {
  sessionId: string;
  tenantId: string;
  leadId?: string;
  reason: string;
  context: ChatContext;
  requestedAt: number;
  status: 'pending' | 'accepted' | 'completed' | 'rejected';
}

export interface ExtractedLeadInfo {
  name?: string;
  phone?: string;
  email?: string;
  propertyType?: string;
  location?: string;
  budgetMin?: number;
  budgetMax?: number;
  bedrooms?: number;
  notes?: string;
}

// ============================================================================
// SECTION 8 — Backward-Compatibility Aliases
// ============================================================================
// These aliases ensure the existing widget components and API routes
// continue to work without modification. The widget code imports
// ChatMessage and BotResponse expecting the widget versions.

/** @deprecated Use WidgetChatMessage for widget code, EngineChatMessage for engine code */
export type ChatMessage = WidgetChatMessage;

/** @deprecated Use WidgetBotResponse for widget code, EngineBotResponse for engine code */
export type BotResponse = WidgetBotResponse;
