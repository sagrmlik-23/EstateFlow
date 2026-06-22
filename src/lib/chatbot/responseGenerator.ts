// ============================================================================
// EstateFlow CRM — Response Generator
// Phase 5 — AI Chatbot (AGENT-5-1-CHATBOT-ENGINE)
// ============================================================================
//
// Generates contextual bot responses based on NLU intent, extracted entities,
// and conversation history. Supports Hindi, English, Hinglish responses with
// rich media (property cards, location suggestions) and multi-turn context.
// ============================================================================

import type { ChatIntent, NLUResult, EngineBotResponse, ChatContext, BotRichMedia } from '@/types/chatbot';

// ============================================================================
// Response Templates
// ============================================================================

interface ResponseTemplate {
  text: string | ((entities: NLUResult['entities'], context: ChatContext) => string);
  suggestions?: string[];
  richMedia?: BotRichMedia[];
}

/**
 * Response template sets for each intent — provides varied responses
 * to make the bot feel more natural.
 */
const RESPONSE_TEMPLATES: Record<ChatIntent, ResponseTemplate[]> = {
  greeting: [
    {
      text: 'Namaste! 👋 Main EstateFlow CRM ka AI assistant hoon. Aapko kis tarah ki property chahiye? Budget aur location batao — main aapke liye best options dhundh dunga!',
      suggestions: ['2BHK flat dikhao', 'Budget 50 lakh', 'Mumbai mein property', 'Site visit book karo'],
    },
    {
      text: 'Hello! 🙏 Welcome to EstateFlow. Kya aap koi specific property dhundh rahe hain? BHK, budget, location — jo batao, main turant search karta hoon!',
      suggestions: ['3BHK villa', '1 crore budget', 'Pune mein flat', 'Agent se baat karo'],
    },
    {
      text: 'Hey there! 🏡 Aapki property search mein aapka swagat hai. Batao kya chahiye — flat, villa, ya plot? Hinglish mein bhi boldo, main samajh jaunga!',
      suggestions: ['Property dikhao', 'Budget batao', 'Location search', 'Schedule visit'],
    },
  ],
  property_search: [
    {
      text: (entities, ctx) => {
        const parts: string[] = ['Bahut badhiya! 🎯 Aapke liye best properties search kar raha hoon'];
        if (entities.bedrooms) parts.push(`${entities.bedrooms.value} BHK`);
        if (entities.propertyType) parts.push(`${entities.propertyType.value}`);
        if (entities.location) parts.push(`${entities.location.value} mein`);
        if (entities.budget) parts.push(`${formatBudgetInWords(entities.budget.value as number)} tak ke budget mein`);
        return parts.join(' ') + '. Kuch der mein results aa jaayenge! ⏳';
      },
      suggestions: ['Price ke hisaab se', 'Location change', 'Filter aur laga', 'Details dekhna hai'],
      richMedia: [{ type: 'quick_reply', data: { options: ['Budget filter', 'BHK filter', 'Location filter'] } }],
    },
    {
      text: (entities, ctx) => {
        if (!entities.location && !entities.bedrooms && !entities.budget) {
          return 'Main aapki madad kar sakta hoon! 🏠 Lekin pehle kuch details chahiye:\n\n1️⃣ Kahan pe property chahiye? (City/Area)\n2️⃣ Kitne BHK? (2BHK, 3BHK)\n3️⃣ Budget kitna hai?\n\nYe batao, fir main perfect option laa dunga! ✨';
        }
        return 'Excellent choice! 🔍 Aapke criteria ke hisaab se properties search kar raha hoon. Thoda patience — results aa rahe hain!';
      },
      suggestions: ['Mumbai mein', '2BHK', '50 lakh', 'New property'],
    },
  ],
  price_inquiry: [
    {
      text: (entities, ctx) => {
        if (entities.budget) {
          const budgetVal = entities.budget.value as number;
          return `₹${(budgetVal / 100000).toFixed(budgetVal >= 10000000 ? 0 : 1)} lakh ka budget? 👌 Aapke budget mein bahut saare options hain! Kya aapko koi specific BHK chahiye ya location preference hai?`;
        }
        return 'Price ki baat karte hain! 💰 Aapka approximate budget kitna hai? Jaise: 50 lakh, 1 crore, 2 crore?';
      },
      suggestions: ['50 lakh', '1 crore', '2 crore', '3BHK price'],
    },
    {
      text: (entities, ctx) => {
        const budgetVal = entities.budget?.value as number | undefined;
        if (budgetVal) {
          return `₹${new Intl.NumberFormat('en-IN').format(budgetVal)} tak ke budget mein properties dikhate hain? 🏡 Kya aap koi specific area ya BHK preference bata sakte hain?`;
        }
        return 'Budget batao, main best deal dhundh ke laaunga! 📊 Aapko kitne tak ki property chahiye?';
      },
      suggestions: ['Under 50 lakh', '1-2 crore', 'No budget limit', 'EMI option'],
    },
  ],
  location_query: [
    {
      text: (entities, ctx) => {
        if (entities.location) {
          return `${entities.location.value} area! 👌 Bahut acchi location hai. Aap ${entities.location.value} mein kis type ki property dhundh rahe hain — flat, villa, ya plot? Aur budget kya hai?`;
        }
        return 'Location search! 📍 Aapko kis city ya area mein property chahiye? Jaise: Mumbai, Pune, Bangalore, Gurgaon, Delhi — ya koi specific sector/locality?';
      },
      suggestions: ['Mumbai', 'Pune', 'Bangalore', 'Gurgaon', 'Delhi NCR'],
      richMedia: [{ type: 'quick_reply', data: { options: ['Mumbai', 'Pune', 'Bangalore', 'Gurgaon', 'Delhi NCR', 'Other'] } }],
    },
    {
      text: (entities, ctx) => {
        const loc = entities.location?.value || 'aapki preferred location';
        return `📌 ${loc} — accha choice! Kya aap ${loc} mein specific area ya sector bata sakte hain? Aur kitne BHK chahiye?`;
      },
      suggestions: ['Sector 1-50', 'Phase 1-5', 'All sectors', 'Near metro'],
    },
  ],
  schedule_visit: [
    {
      text: (entities, ctx) => {
        if (!ctx.phone && !ctx.name) {
          return 'Site visit schedule karne ke liye 🏗️ thodi details chahiye:\n\n1️⃣ Aapka naam?\n2️⃣ Phone number\n3️⃣ Kab dekhna chahenge? (Date & Time)\n\nYe batao, main appointment fix kar dunga! 📅';
        }
        return 'Visit schedule kar raha hoon! 🗓️ Kab dekhna chahenge — kal ya is weekend? Subah ya shaam ka time? Aur main aapko location ka address bhej dunga WhatsApp pe.';
      },
      suggestions: ['Aaj hi', 'Kal subah', 'Is weekend', 'Send location'],
    },
    {
      text: 'Property dekhne ka plan! 🏠 Bahut accha. Aapko kab visit karna hai? Main turant slot check karta hoon aur aapko confirm kar dunga. Time prefer karte hain?',
      suggestions: ['10 AM', '2 PM', '5 PM', 'Anytime'],
    },
  ],
  contact_agent: [
    {
      text: 'Koi baat nahi! 🤝 Main aapko ek human agent se connect kar dunga jo aapki saari queries resolve karega. Thoda sa aapka naam aur phone number batao — agent aapko call back karega!',
      suggestions: ['Call me now', 'WhatsApp pe message', 'Email details', 'Schedule callback'],
    },
    {
      text: 'Agent se baat karna chahte hain? 👍 Aapka phone number batao, hamare real estate expert aapko turant call karenge. Extra discount bhi dilwa denge! 😊',
      suggestions: ['9876543210', 'WhatsApp pe bhejo', 'Email batao', 'Call back later'],
    },
  ],
  site_visit: [
    {
      text: (entities, ctx) => {
        if (!ctx.phone) {
          return 'Site visit ke liye 🏗️ aapka phone number chahiye. Batao — main visit schedule kar dunga aur aapko confirmation bhejunga!';
        }
        return 'Visit ready! ✅ Aapko location details bhej du? Kya aapko directions chahiye? Aur kitne log aayenge, batao taake hum sabka dhyan rakh saken!';
      },
      suggestions: ['Send location', 'Google Maps link', 'Directions', 'Parking available?'],
    },
  ],
  general_query: [
    {
      text: 'Interesting question! 🤔 Main aapki madad karne ki koshish karunga. Kya aap ye jaanna chahte hain:\n\n1️⃣ Property prices ke baare mein?\n2️⃣ Location ke baare mein?\n3️⃣ Visit schedule karna?\n4️⃣ Agent se baat karna?\n\nKoi sa batao, main help karunga! 😊',
      suggestions: ['Price help', 'Location info', 'Book visit', 'Talk to agent'],
    },
    {
      text: 'Hmm, main samajh gaya! 💡 Thoda aur detail batao taake main aapki madad kar sakun. Property, price, location — kiske baare mein jaanna chahte hain?',
      suggestions: ['Property search', 'Price inquiry', 'Location info', 'Schedule visit'],
    },
  ],
  handoff: [
    {
      text: 'I understand you want to talk to a human. 🤝 Let me connect you with our team. Aapka naam aur phone number share karein? Hamara team aapko turant call karega!',
      suggestions: ['My name is...', 'Call me at...', 'Email me at...'],
    },
    {
      text: 'Mujhe maloom hai ki kabhi kabhi bot se baat karna irritating hota hai. 😅 No worries! Main aapko ek real estate expert se connect kar raha hoon. Bus apna phone number batao — woh aapko 5 minute mein call karenge!',
      suggestions: ['Phone: 98765...', 'WhatsApp', 'Email', 'Schedule call'],
    },
  ],
};

// ============================================================================
// Fallback Response
// ============================================================================

const FALLBACK_RESPONSES = [
  'Mujhe samajh nahi aaya 😅 Kya aap thoda aur detail mein bata sakte hain? Main property search, price, location, aur site visit mein help kar sakta hoon!',
  'Maaf karna, main samajh nahi paya 🙏 Kya aap ye bata sakte hain:\n\n🏠 Kis type ki property chahiye?\n💰 Budget kitna hai?\n📍 Kahan pe chahiye?\n\nMain turant help karunga!',
  'Oops! 🤖 Main aapki baat theek se samajh nahi paya. Aap Hinglish mein bhi bol sakte hain! Kuch examples:\n\n"2BHK flat Mumbai mein"\n"50 lakh budget mein property"\n"Kal site visit karna hai"',
];

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format budget in Indian number format (lakhs/crores).
 */
function formatBudgetInWords(amount: number): string {
  if (amount >= 10_000_000) {
    return `₹${(amount / 10_000_000).toFixed(amount % 10_000_000 === 0 ? 0 : 1)} crore`;
  }
  return `₹${(amount / 100_000).toFixed(amount % 100_000 === 0 ? 0 : 1)} lakh`;
}

/**
 * Get a random item from an array (for varied responses).
 */
function pickRandom<T>(items: T[]): T | undefined {
  if (items.length === 0) return undefined;
  return items[Math.floor(Math.random() * items.length)]!;
}

/**
 * Clean missing info fields from context for prompting.
 */
function getMissingInfo(context: ChatContext): string[] {
  const missing: string[] = [];
  if (!context.location) missing.push('location');
  if (!context.budget) missing.push('budget');
  if (!context.bedrooms && !context.propertyType) missing.push('bedrooms');
  if (!context.name) missing.push('name');
  if (!context.phone) missing.push('phone');
  return missing;
}

// ============================================================================
// generateResponse — Main response generator
// ============================================================================

/**
 * Generate a contextual bot response based on NLU result and conversation history.
 * Supports multi-turn, Hinglish responses, and rich media.
 *
 * @param nluResult - Parsed NLU result with intent and entities
 * @param context - Current conversation context (budget, location, preferences)
 * @returns Formatted bot response with text, suggestions, and rich media
 */
export function generateResponse(
  nluResult: NLUResult,
  context: ChatContext,
): EngineBotResponse {
  const { intent, confidence, entities } = nluResult;

  // --- Determine if handoff is needed ---
  const shouldHandoff = confidence < 0.15 && context.turnCount >= 3;

  // --- Get templates for this intent ---
  const templates = RESPONSE_TEMPLATES[intent] || RESPONSE_TEMPLATES.general_query;
  const template = pickRandom(templates) ?? templates[0] ?? RESPONSE_TEMPLATES.general_query[0]!;

  // --- Generate text ---
  let text: string;
  if (typeof template.text === 'function') {
    text = template.text(entities, context);
  } else {
    text = template.text;
  }

  // --- Check if we need to ask for more info ---
  const missingInfo = getMissingInfo(context);
  if (missingInfo.length > 0 && intent !== 'greeting' && intent !== 'handoff') {
    // Only prompt for info we don't already have
    if (!context.location && !entities.location) {
      text += '\n\n📍 Kahan pe property chahiye? City ya area batao.';
    } else if (!context.budget && !entities.budget) {
      text += '\n\n💰 Budget kitna hai? Jaise 50 lakh, 1 crore?';
    } else if (!context.bedrooms && !entities.bedrooms) {
      text += '\n\n🛏 Kitne BHK chahiye? 1BHK, 2BHK, 3BHK?';
    }
  }

  // --- Build response ---
  const response: EngineBotResponse = {
    text,
    intent,
    confidence,
    suggestions: template.suggestions || defaultSuggestions(intent),
    richMedia: template.richMedia || [],
    actions: determineActions(intent, entities, context),
    handoffSuggested: shouldHandoff,
  };

  return response;
}

// ============================================================================
// generateFallbackResponse — Fallback for unknown queries
// ============================================================================

/**
 * Generate a fallback response when the bot doesn't understand the user.
 *
 * @param context - Current conversation context
 * @returns Fallback bot response
 */
export function generateFallbackResponse(context: ChatContext): EngineBotResponse {
  const text = pickRandom(FALLBACK_RESPONSES) ?? 'Mujhe samajh nahi aaya. Kya aap thoda aur detail mein bata sakte hain?';

  return {
    text,
    intent: context.lastIntent || 'general_query',
    confidence: 0.1,
    suggestions: ['Property dikhao', 'Budget batao', 'Location search', 'Site visit'],
    handoffSuggested: context.turnCount >= 3,
  };
}

// ============================================================================
// Default Suggestions by Intent
// ============================================================================

function defaultSuggestions(intent: ChatIntent): string[] {
  const suggestionsMap: Record<ChatIntent, string[]> = {
    greeting: ['2BHK flat', 'Mumbai property', 'Budget 50 lakh', 'Site visit'],
    property_search: ['Filter price', 'Change location', 'More options', 'Details'],
    price_inquiry: ['50 lakh', '1 crore', '2 crore', 'Show options'],
    location_query: ['Mumbai', 'Pune', 'Bangalore', 'Delhi NCR'],
    schedule_visit: ['Today', 'Tomorrow', 'This weekend', 'Morning'],
    contact_agent: ['Call me', 'WhatsApp', 'Email', 'Schedule'],
    site_visit: ['Send address', 'Directions', 'Parking?', 'Timing'],
    general_query: ['Property search', 'Price', 'Location', 'Visit'],
    handoff: ['My name is...', 'Phone number...', 'Email...', 'Call back'],
  };
  return suggestionsMap[intent] || suggestionsMap.general_query;
}

// ============================================================================
// determineActions — Figure out what actions the bot should trigger
// ============================================================================

function determineActions(
  intent: ChatIntent,
  entities: NLUResult['entities'],
  context: ChatContext,
): EngineBotResponse['actions'] {
  const actions: EngineBotResponse['actions'] = [];

  switch (intent) {
    case 'property_search':
      if (entities.location || entities.budget || entities.bedrooms) {
        actions.push({
          type: 'search_properties',
          payload: {
            location: entities.location?.value || context.location,
            budgetMin: context.budget?.min,
            budgetMax: entities.budget?.value || context.budget?.max,
            bedrooms: entities.bedrooms?.value || context.bedrooms,
            propertyType: entities.propertyType?.value || context.propertyType,
          },
        });
      }
      break;

    case 'price_inquiry':
      if (entities.budget) {
        actions.push({
          type: 'search_properties',
          payload: {
            budgetMax: entities.budget.value,
            budgetMin: typeof entities.budget.value === 'number' ? (entities.budget.value as number) * 0.7 : undefined,
          },
        });
      }
      break;

    case 'schedule_visit':
    case 'site_visit':
      if (context.phone || entities.phone) {
        actions.push({
          type: 'schedule_visit',
          payload: {
            phone: entities.phone?.value || context.phone,
            name: entities.name?.value || context.name,
            timeline: entities.timeline?.value || context.timeline,
          },
        });
      }
      break;

    case 'contact_agent':
    case 'handoff':
      actions.push({
        type: 'connect_agent',
        payload: {
          reason: 'User requested human agent',
          phone: entities.phone?.value || context.phone,
          name: entities.name?.value || context.name,
        },
      });
      break;
  }

  return actions;
}

// ============================================================================
// generateFollowUpQuestion — Generate context-aware follow-up
// ============================================================================

/**
 * Generate a follow-up question based on what info is still missing.
 */
export function generateFollowUpQuestion(context: ChatContext): string {
  const missing = getMissingInfo(context);

  if (missing.length === 0) {
    return 'Kya main aapki kisi aur cheez mein help kar sakta hoon?';
  }

  const questions: Record<string, string> = {
    location: '📍 Aapko kis city ya area mein property chahiye? Jaise Mumbai, Pune, Bangalore...',
    budget: '💰 Aapka approximate budget kitna hai? 50 lakh, 1 crore, 2 crore?',
    bedrooms: '🛏 Kitne bedrooms chahiye? 1BHK, 2BHK, 3BHK, ya 4BHK?',
    name: '👤 Aapka naam kya hai?',
    phone: '📞 Aapka phone number kya hai? Main property details aur visit confirmation bhejunga.',
  };

  return (missing[0] && questions[missing[0]]) || 'Kya aap aur kuch bata sakte hain?';
}
