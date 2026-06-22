// ============================================================================
// EstateFlow CRM — Default AI Agent Templates
// Phase 3: AI Voice Agent — Agent Configuration System
// ============================================================================

import type {
  SaaSOwnerAIAgent,
  ClientAIAgent,
  AgentBehavior,
  ScriptTemplateSet,
} from '@/types/ai';

// ---------------------------------------------------------------------------
// Default SaaS Owner Agent — Priya (Hindi + English)
// ---------------------------------------------------------------------------

export function getDefaultSaaSAgent(): SaaSOwnerAIAgent {
  return {
    id: 'default-saas-agent',
    name: 'Priya',
    voice: 'default-female',
    language: 'hi,en',
    purpose: 'Lead qualification and sales follow-up for real estate CRM tenants',
    scriptTemplate: `Hello {leadName}, this is Priya from EstateFlow AI. I'm calling to follow up on your interest in properties in {location}. How are you doing today?`,
    maxConcurrentCalls: 20,
    workingHours: {
      start: '09:00',
      end: '20:00',
      timezone: 'Asia/Kolkata',
    },
    retryPolicy: {
      maxRetries: 3,
      retryDelayMinutes: 30,
      retryOnBusy: true,
      retryOnNoAnswer: true,
      retryOnFailed: false,
    },
  };
}

// ---------------------------------------------------------------------------
// Default Client Agent — Sneha (Hindi)
// ---------------------------------------------------------------------------

export function getDefaultClientAgent(tenantId: string): ClientAIAgent {
  return {
    id: '',
    tenantId,
    name: 'Sneha',
    voice: 'default-female',
    language: 'hi',
    greeting: 'नमस्ते! मैं स्नेहा बोल रही हूँ, [Company Name] से।',
    scriptTemplates: getDefaultScriptTemplates(),
    behavior: getDefaultBehavior(),
    status: 'active',
    currentCalls: 0,
    totalCalls: 0,
  };
}

// ---------------------------------------------------------------------------
// Default script templates for all 6 scenarios
// ---------------------------------------------------------------------------

export function getDefaultScriptTemplates(): ScriptTemplateSet {
  return {
    firstContact: `नमस्ते {leadName} जी! मैं {agentName} बोल रही हूँ, {companyName} से। 
हमें {propertyType} में आपकी रुचि के बारे में पता चला। क्या मैं आपको इस प्रॉपर्टी के बारे में थोड़ी जानकारी दे सकती हूँ?
क्या अभी बात करने का समय सही है?`,

    followUp: `नमस्ते {leadName} जी! मैं {agentName} बोल रही हूँ, {companyName} से। 
हमने पिछली बार {propertyName} के बारे में बात की थी। 
क्या आपको कोई और जानकारी चाहिए या कोई सवाल है जो मैं clear कर सकती हूँ?
क्या हम आगे बढ़ने पर विचार कर सकते हैं?`,

    siteVisitConfirm: `नमस्ते {leadName} जी! मैं {agentName} बोल रही हूँ, {companyName} से। 
यह कॉल {propertyName} की साइट विज़िट के संबंध में है।
आपकी साइट विज़िट {date} को {time} पर scheduled है। कृपया नीचे दिए गए पते पर पहुँचें:
{address}
क्या आपके पास कोई सवाल है या समय बदलने की आवश्यकता है?
हमें आपसे मिलने की उम्मीद है!`,

    postVisit: `नमस्ते {leadName} जी! मैं {agentName} बोल रही हूँ, {companyName} से। 
आपने हाल ही में {propertyName} देखा था। मुझे उम्मीद है कि आपको विज़िट पसंद आई होगी।
प्रॉपर्टी के बारे में आपके क्या विचार हैं? क्या कोई सवाल है जिसका जवाब मैं दे सकती हूँ?
हम अभी कुछ विशेष ऑफ़र पर काम कर रहे हैं जो आपकी रुचि के हो सकते हैं।`,

    negotiation: `नमस्ते {leadName} जी! मैं {agentName} बोल रही हूँ, {companyName} से। 
मैं {propertyName} की कीमत और शर्तों पर चर्चा करने के लिए कॉल कर रही हूँ।
हम समझते हैं कि कीमत एक महत्वपूर्ण कारक है, और हम एक अच्छा deal आपके लिए लाना चाहते हैं।
वर्तमान कीमत {price} है। क्या हम किसी ऐसी बात पर बात कर सकते हैं जो आपके budget में फिट हो?
हम आपको {offers} तक की छूट दे सकते हैं।`,

    reEngagement: `नमस्ते {leadName} जी! मैं {agentName} बोल रही हूँ, {companyName} से। 
हमने कुछ समय पहले बात की थी और मैं आपको फिर से संपर्क कर रही हूँ।
हमारे पास {location} में कुछ नई प्रॉपर्टी आई हैं जो आपकी आवश्यकताओं से मेल खा सकती हैं।
क्या आप अभी भी प्रॉपर्टी की तलाश में हैं? मैं आपको नए विकल्पों के बारे में बता सकती हूँ।`,
  };
}

// ---------------------------------------------------------------------------
// Default behavior config
// ---------------------------------------------------------------------------

export function getDefaultBehavior(): AgentBehavior {
  return {
    callDelayMinutes: 5,
    maxCallDuration: 300, // 5 minutes
    maxRetries: 3,
    transferToHuman: {
      budgetThreshold: 5000000, // ₹50L — transfer if budget exceeds this
      angerDetected: true,    // transfer if customer is angry
      complexQuestion: true,   // transfer if customer asks complex questions
    },
    offers: {
      maxDiscount: 5,          // 5% max discount
      canOfferParking: true,
      canOfferFurniture: false,
      canOfferMaintenance: true,
    },
  };
}

// ---------------------------------------------------------------------------
// Default agent response — full object for API consumption
// ---------------------------------------------------------------------------

export interface DefaultAgentTemplate {
  name: string;
  voice: string;
  language: string;
  greeting: string;
  scriptTemplates: ScriptTemplateSet;
  behavior: AgentBehavior;
  maxConcurrentCalls: number;
}

export function getDefaultAgentTemplate(): DefaultAgentTemplate {
  return {
    name: 'Sneha',
    voice: 'default-female',
    language: 'hi',
    greeting: 'नमस्ते! मैं स्नेहा बोल रही हूँ, [Company Name] से।',
    scriptTemplates: getDefaultScriptTemplates(),
    behavior: getDefaultBehavior(),
    maxConcurrentCalls: 5,
  };
}
