// ============================================================================
// EstateFlow CRM — WhatsApp Chatbot
// Phase 5 — AI Chatbot (AGENT-5-3-WHATSAPP-CHATBOT)
// ============================================================================
//
// WhatsAppBot processes incoming WhatsApp messages via the WATI provider,
// maintains sessions per phone number, and supports Hinglish responses.
// ============================================================================

import { WATIProvider } from '@/lib/communication/providers/wati';
import type { WATIWebhookPayload } from '@/lib/communication/providers/wati';
import type {
  ChatbotSession,
  ChatbotMessage,
  WhatsAppBotResponse,
  ConversationContext,
  ChatbotSessionStatus,
} from '@/types/chatbot';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const MAX_TURNS_PER_SESSION = 100;
const DEFAULT_LANGUAGE = 'hinglish';

// ---------------------------------------------------------------------------
// In-memory stores (production would use Redis/DB)
// ---------------------------------------------------------------------------

const sessions = new Map<string, ChatbotSession>();
const contexts = new Map<string, ConversationContext>();
const messageHistory = new Map<string, ChatbotMessage[]>();

// ---------------------------------------------------------------------------
// Hinglish Helper
// ---------------------------------------------------------------------------

const HINGLISH_GREETINGS = [
  'Namaste! 🏡 EstateFlow mein aapka swagat hai!',
  'Namaste ji! EstateFlow par aapka hardik swagat hai.',
  'Hello! EstateFlow CRM mein aapka swagat hai. Kaise madad kar sakte hain?',
];

const HINGLISH_FALLBACKS: Record<string, string> = {
  property_inquiry: 'Aap kis type ki property dhundh rahe hain?',
  budget_query: 'Aapka budget kya hai?',
  location_query: 'Aap kis location mein property dhundh rahe hain?',
  schedule_visit: 'Site visit kab karna chahenge?',
  help: 'Main aapki madad kaise kar sakta hoon?',
};

function randomGreeting(): string {
  return HINGLISH_GREETINGS[Math.floor(Math.random() * HINGLISH_GREETINGS.length)]!;
}

function detectLanguage(text: string): string {
  const devanagari = /[\u0900-\u097F]/;
  const hinglishMarkers = /\b(kaise|kya|hai|hain|hoon|nahi|aap|main|tum|yeh|woh|aur|lekin|kyunki)\b/i;

  if (devanagari.test(text)) return 'hi';
  if (hinglishMarkers.test(text)) return 'hinglish';
  return 'en';
}

// ---------------------------------------------------------------------------
// Simple intent detection
// ---------------------------------------------------------------------------

function detectIntent(text: string): string {
  const lower = text.toLowerCase().trim();

  if (/^(hi|hello|hey|namaste|namaskar|hii|helloo)/i.test(lower)) return 'greeting';
  if (/\b(bye|goodbye|thanks|thank you|dhanyavaad|alvida)\b/i.test(lower)) return 'farewell';
  if (/\b(flat|apartment|house|villa|plot|property|shop|office|commercial)\b/i.test(lower))
    return 'property_inquiry';
  if (/\b(budget|price|cost|rate|kitna|₹|rs\.?|lakh|crore)\b/i.test(lower))
    return 'budget_query';
  if (/\b(location|area|sector|lucknow|noida|gurgaon|delhi|mumbai|bangalore|pune|kahan)\b/i.test(lower))
    return 'location_query';
  if (/\b(visit|tour|dikhao|dikhaye|dekhna|show|schedule|appointment|meeting)\b/i.test(lower))
    return 'schedule_visit';
  if (/\b(agent|human|talk|speak|baat|connect|real person|customer care|support)\b/i.test(lower))
    return 'request_human';
  if (/\b(help|madad|sahayata|guide|info|information)\b/i.test(lower))
    return 'help';
  if (/\b(price|rate|cost|kitne ka|kitne mein|emi|loan)\b/i.test(lower))
    return 'price_query';

  return 'unknown';
}

// ---------------------------------------------------------------------------
// Response Builder
// ---------------------------------------------------------------------------

function buildResponse(intent: string, context: ConversationContext): WhatsAppBotResponse {
  const lang = context.language;

  switch (intent) {
    case 'greeting':
      return {
        text: randomGreeting(),
        type: 'text',
        quickReplies: [
          'Properties dikhayein',
          'Budget batao',
          'Site visit book karein',
          'Agent se baat karein',
        ],
      };

    case 'farewell':
      return {
        text: lang === 'hinglish'
          ? 'Dhanyavaad! Koi aur madad chahiye toh humein batayein. 🙏'
          : 'Thank you! Let us know if you need any further assistance. 🙏',
        type: 'text',
      };

    case 'property_inquiry':
      context.collectedData.intent = 'property_inquiry';
      return {
        text: lang === 'hinglish'
          ? 'Bahut accha! Aap kis type ki property dhundh rahe hain?\n\n' +
            'Jaise: 2BHK flat, 3BHK villa, commercial shop, ya plot?'
          : 'Great! What type of property are you looking for?\n\n' +
            'Eg: 2BHK apartment, 3BHK villa, commercial shop, or plot?',
        type: 'text',
        quickReplies: ['2BHK Flat', '3BHK Villa', 'Commercial Shop', 'Plot'],
      };

    case 'budget_query':
      context.collectedData.intent = 'budget_query';
      return {
        text: lang === 'hinglish'
          ? 'Aapka budget kitna hai? Hum aapke budget ke hisaab se best options dikhayenge.\n\n' +
            'Jaise: 30-50 lakh, 50-80 lakh, ya 1 crore+'
          : 'What is your budget range? We will show you the best options based on your budget.\n\n' +
            'Eg: 30-50 lakh, 50-80 lakh, or 1 crore+',
        type: 'text',
        quickReplies: ['₹30-50 Lakh', '₹50-80 Lakh', '₹80 Lakh - 1 Cr', '1 Cr+'],
      };

    case 'location_query':
      context.collectedData.intent = 'location_query';
      return {
        text: lang === 'hinglish'
          ? 'Aap kis location mein property dhundh rahe hain? Humari properties in cities mein available hain:\n\n' +
            '🏙️ Lucknow, Noida, Gurgaon, Delhi, Mumbai, Bangalore, Pune'
          : 'Which location are you looking for properties in? We have properties available in:\n\n' +
            '🏙️ Lucknow, Noida, Gurgaon, Delhi, Mumbai, Bangalore, Pune',
        type: 'text',
        quickReplies: ['Lucknow', 'Noida', 'Gurgaon', 'Mumbai', 'Bangalore'],
      };

    case 'schedule_visit':
      context.collectedData.intent = 'schedule_visit';
      return {
        text: lang === 'hinglish'
          ? 'Site visit schedule karne ke liye humein kuch details chahiye:\n\n' +
            '1️⃣ Aapki preferred date?\n' +
            '2️⃣ Kaunsi property dekhni hai?\n' +
            '3️⃣ Time slot (morning/afternoon/evening)?\n\n' +
            'Ya phir aap seedha agent se baat kar sakte hain.'
          : 'To schedule a site visit, we need a few details:\n\n' +
            '1️⃣ Your preferred date?\n' +
            '2️⃣ Which property are you interested in?\n' +
            '3️⃣ Time slot (morning/afternoon/evening)?\n\n' +
            'Or you can directly speak to an agent.',
        type: 'text',
        quickReplies: ['Agent se baat karein', 'Kal morning', 'This weekend'],
      };

    case 'request_human':
      return {
        text: lang === 'hinglish'
          ? 'Ji, main aapko ek human agent se connect kar raha hoon. Thodi der mein aapko call ya message aayega. ⏳'
          : 'Sure, I am connecting you to a human agent. You will receive a call or message shortly. ⏳',
        type: 'text',
      };

    case 'price_query':
      return {
        text: lang === 'hinglish'
          ? 'Humari properties alag-alag price ranges mein available hain. Kya aap apna budget bata sakte hain?'
          : 'Our properties are available in various price ranges. Could you tell me your budget?',
        type: 'text',
        quickReplies: ['₹30-50 Lakh', '₹50-80 Lakh', '₹1 Cr+'],
      };

    case 'help':
      return {
        text: lang === 'hinglish'
          ? 'Main aapki in cheezon mein madad kar sakta hoon:\n\n' +
            '🏠 Properties dekhna\n' +
            '💰 Budget ke hisaab se suggestions\n' +
            '📍 Location-wise search\n' +
            '📅 Site visit book karna\n' +
            '👤 Agent se baat karna\n\n' +
            'Kya aapko kisi cheez mein help chahiye?'
          : 'I can help you with:\n\n' +
            '🏠 View properties\n' +
            '💰 Budget-based suggestions\n' +
            '📍 Location-wise search\n' +
            '📅 Schedule a site visit\n' +
            '👤 Speak to an agent\n\n' +
            'What would you like help with?',
        type: 'text',
        quickReplies: [
          'Properties dikhayein',
          'Budget batao',
          'Agent se baat karein',
        ],
      };

    case 'unknown':
    default:
      return {
        text: lang === 'hinglish'
          ? 'Mujhe samajh nahi aaya. Kya aap thoda aur detail mein bata sakte hain?\n\n' +
            'Main yeh madad kar sakta hoon:\n' +
            '🏠 Properties ke liye "properties dikhayein"\n' +
            '💰 Budget ke liye "kitna hai"\n' +
            '👤 Agent se baat karne ke liye "agent se baat"'
          : "I didn't quite understand that. Could you please elaborate?\n\n" +
            'Here is what I can help with:\n' +
            '🏠 Say "show properties" to see listings\n' +
            '💰 Say "budget" to set your price range\n' +
            '👤 Say "talk to agent" to speak with a human',
        type: 'text',
        quickReplies: ['Properties dikhayein', 'Budget batao', 'Agent se baat karein'],
      };
  }
}

// ---------------------------------------------------------------------------
// WhatsAppBot
// ---------------------------------------------------------------------------

export class WhatsAppBot {
  private readonly watiProvider: WATIProvider;
  public readonly name = 'whatsapp-bot';

  constructor(watiProvider: WATIProvider) {
    this.watiProvider = watiProvider;
  }

  // -----------------------------------------------------------------------
  // handleIncomingMessage — Process incoming WhatsApp message
  // -----------------------------------------------------------------------

  async handleIncomingMessage(
    payload: WATIWebhookPayload,
  ): Promise<{ handled: boolean; response?: WhatsAppBotResponse; session: ChatbotSession; handoffRequested: boolean }> {
    const phoneNumber = payload.from ?? '';
    const messageBody = payload.body ?? '';
    const messageType = payload.type ?? 'text';
    const mediaUrl = payload.mediaUrl;
    const tenantId = 'default'; // In production, resolve from WATI number or header

    if (!phoneNumber) {
      console.warn('[WhatsAppBot] Received message without from number');
      return { handled: false, session: null as unknown as ChatbotSession, handoffRequested: false };
    }

    // ── Get or create session ─────────────────────────────────────────────
    let session = sessions.get(phoneNumber);
    if (!session) {
      session = this.createSession(phoneNumber, tenantId);
    }

    // ── Get or create context ─────────────────────────────────────────────
    let context = contexts.get(phoneNumber);
    if (!context) {
      context = {
        sessionId: session.id,
        phoneNumber,
        tenantId,
        language: detectLanguage(messageBody),
        turnCount: 0,
        collectedData: {},
        metadata: {},
      };
    }

    // Update language based on message
    context.language = detectLanguage(messageBody);
    context.turnCount++;

    // ── Store inbound message ──────────────────────────────────────────────
    const inboundMessage: ChatbotMessage = {
      id: crypto.randomUUID(),
      sessionId: session.id,
      from: phoneNumber,
      to: this.watiProvider['config']?.whatsappNumber ?? '',
      type: messageType,
      content: messageBody,
      mediaUrl,
      latitude: payload.latitude,
      longitude: payload.longitude,
      label: payload.label,
      buttonText: payload.buttonText,
      timestamp: new Date().toISOString(),
      direction: 'inbound',
    };

    this.storeMessage(inboundMessage);

    // ── Update session timestamp ──────────────────────────────────────────
    session.lastMessageAt = new Date().toISOString();

    // ── Handle media messages ────────────────────────────────────────────
    if (messageType === 'image' && mediaUrl) {
      context.collectedData.hasImage = true;
    }

    if (messageType === 'location' && payload.latitude && payload.longitude) {
      context.collectedData.latitude = payload.latitude;
      context.collectedData.longitude = payload.longitude;
      context.collectedData.label = payload.label;
    }

    // ── Detect intent and build response ─────────────────────────────────
    const intent = detectIntent(messageBody);
    context.lastIntent = intent;

    let handoffRequested = false;

    // Check if human handoff was requested
    if (intent === 'request_human') {
      handoffRequested = true;
    }

    // Check max turns
    if (context.turnCount >= MAX_TURNS_PER_SESSION) {
      handoffRequested = true;
    }

    // Build bot response
    const response = buildResponse(intent, context);

    // ── Send response via WATI ───────────────────────────────────────────
    await this.sendBotResponse(phoneNumber, response, context.language);

    // ── Store outbound message ───────────────────────────────────────────
    const outboundMessage: ChatbotMessage = {
      id: crypto.randomUUID(),
      sessionId: session.id,
      from: this.watiProvider['config']?.whatsappNumber ?? '',
      to: phoneNumber,
      type: 'text',
      content: response.text,
      timestamp: new Date().toISOString(),
      direction: 'outbound',
      metadata: { intent, language: context.language },
    };

    this.storeMessage(outboundMessage);

    // ── Save updated context ─────────────────────────────────────────────
    contexts.set(phoneNumber, context);

    return {
      handled: true,
      response,
      session,
      handoffRequested,
    };
  }

  // -----------------------------------------------------------------------
  // sendBotResponse — Send a response message via WATI
  // -----------------------------------------------------------------------

  private async sendBotResponse(
    to: string,
    response: WhatsAppBotResponse,
    _language: string,
  ): Promise<void> {
    try {
      switch (response.type) {
        case 'image':
          if (response.mediaUrl) {
            await this.watiProvider.sendImage(to, response.mediaUrl, response.text);
          }
          break;

        case 'location':
          if (response.latitude != null && response.longitude != null) {
            await this.watiProvider.sendLocation(
              to,
              response.latitude,
              response.longitude,
              response.label ?? response.text,
            );
          }
          break;

        case 'text':
        default:
          await this.watiProvider.sendMessage(to, 'custom_message', {
            message: response.text,
            templateName: 'custom_message',
          });
          break;
      }
    } catch (error) {
      console.error('[WhatsAppBot] Failed to send response:', error);
    }
  }

  // -----------------------------------------------------------------------
  // Session Management
  // -----------------------------------------------------------------------

  createSession(phoneNumber: string, tenantId: string): ChatbotSession {
    const existing = sessions.get(phoneNumber);
    if (existing) return existing;

    const session: ChatbotSession = {
      id: crypto.randomUUID(),
      phoneNumber,
      tenantId,
      status: 'active',
      language: DEFAULT_LANGUAGE,
      lastMessageAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    sessions.set(phoneNumber, session);
    return session;
  }

  getSession(phoneNumber: string): ChatbotSession | undefined {
    return sessions.get(phoneNumber);
  }

  getSessionById(sessionId: string): ChatbotSession | undefined {
    for (const session of sessions.values()) {
      if (session.id === sessionId) return session;
    }
    return undefined;
  }

  updateSessionStatus(phoneNumber: string, status: ChatbotSessionStatus): void {
    const session = sessions.get(phoneNumber);
    if (session) {
      session.status = status;
      session.lastMessageAt = new Date().toISOString();
    }
  }

  closeSession(phoneNumber: string): void {
    const session = sessions.get(phoneNumber);
    if (session) {
      session.status = 'closed';
      session.lastMessageAt = new Date().toISOString();
    }
    contexts.delete(phoneNumber);
  }

  getAllSessions(): ChatbotSession[] {
    return Array.from(sessions.values());
  }

  getActiveSessions(): ChatbotSession[] {
    const now = Date.now();
    return Array.from(sessions.values()).filter((s) => {
      const idleMs = now - new Date(s.lastMessageAt).getTime();
      return s.status !== 'closed' && idleMs < SESSION_IDLE_TIMEOUT_MS;
    });
  }

  // -----------------------------------------------------------------------
  // Message History
  // -----------------------------------------------------------------------

  private storeMessage(message: ChatbotMessage): void {
    const key = message.sessionId;
    const history = messageHistory.get(key) ?? [];
    history.push(message);
    messageHistory.set(key, history);
  }

  getSessionMessages(sessionId: string): ChatbotMessage[] {
    return messageHistory.get(sessionId) ?? [];
  }

  clearSessionMessages(sessionId: string): void {
    messageHistory.delete(sessionId);
  }

  // -----------------------------------------------------------------------
  // Context Management
  // -----------------------------------------------------------------------

  getContext(phoneNumber: string): ConversationContext | undefined {
    return contexts.get(phoneNumber);
  }

  updateContext(phoneNumber: string, updates: Partial<ConversationContext>): void {
    const context = contexts.get(phoneNumber);
    if (context) {
      Object.assign(context, updates);
    }
  }

  // -----------------------------------------------------------------------
  // Static factory
  // -----------------------------------------------------------------------

  static create(watiProvider?: WATIProvider): WhatsAppBot {
    const provider = watiProvider ?? new WATIProvider({
      apiKey: process.env.WATI_API_KEY ?? '',
      whatsappNumber: process.env.WATI_WHATSAPP_NUMBER ?? '',
    });
    return new WhatsAppBot(provider);
  }
}
