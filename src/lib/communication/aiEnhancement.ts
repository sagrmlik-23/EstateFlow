// ============================================================================
// EstateFlow CRM — AI Message Enhancement
// Phase 4 — Communication (AGENT-4-4-TEMPLATES-SHARING)
// ============================================================================
//
// Provides AI-powered message capabilities:
//   - Tone enhancement (professional, friendly, formal, persuasive)
//   - Translation between Hindi and English
//   - Personalization with lead details
//   - Suggested replies based on incoming message context
//
// Uses the configured LLM provider (OpenAI-compatible) via fetch.
// Falls back to rule-based transformations when no LLM is available.
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MessageTone = 'professional' | 'friendly' | 'formal' | 'persuasive' | 'empathetic' | 'neutral';

export type TargetLanguage = 'en' | 'hi' | 'hindi' | 'english';

export interface EnhancementContext {
  /** Lead/customer name for personalization */
  leadName?: string;
  /** Current stage in the sales pipeline */
  stage?: string;
  /** Property being discussed (if applicable) */
  propertyTitle?: string;
  /** User's preferred tone */
  preferredTone?: MessageTone;
  /** Any additional context */
  additionalContext?: string;
}

export interface SuggestionContext {
  /** The incoming message from the lead/customer */
  incomingMessage: string;
  /** Previous conversation history (last few messages) */
  conversationHistory?: string[];
  /** Lead info for context */
  leadName?: string;
  /** Property being discussed */
  propertyTitle?: string;
  /** Current stage */
  stage?: string;
}

// ---------------------------------------------------------------------------
// LLM Configuration
// ---------------------------------------------------------------------------

interface LLMConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

function getLLMConfig(): LLMConfig | null {
  const apiKey = process.env.OPENAI_API_KEY ?? process.env.AI_API_KEY;
  const baseUrl = process.env.AI_API_BASE_URL ?? 'https://api.openai.com/v1';
  const model = process.env.AI_ENHANCEMENT_MODEL ?? 'gpt-4o-mini';

  if (!apiKey) return null;

  return { apiKey, baseUrl, model };
}

// ---------------------------------------------------------------------------
// LLM Call
// ---------------------------------------------------------------------------

interface LLMResponse {
  content: string;
  error?: string;
}

async function callLLM(
  systemPrompt: string,
  userMessage: string,
): Promise<LLMResponse> {
  const config = getLLMConfig();
  if (!config) {
    return { content: '', error: 'No LLM API key configured. Set OPENAI_API_KEY or AI_API_KEY.' };
  }

  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.7,
        max_tokens: 500,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      return {
        content: '',
        error: `LLM API error (${response.status}): ${errorText}`,
      };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim();

    if (!content) {
      return { content: '', error: 'LLM returned empty response' };
    }

    return { content };
  } catch (error) {
    return {
      content: '',
      error: error instanceof Error ? error.message : 'Unknown LLM call error',
    };
  }
}

// ---------------------------------------------------------------------------
// Tone Names
// ---------------------------------------------------------------------------

const TONE_DESCRIPTIONS: Record<MessageTone, string> = {
  professional:
    'Professional and courteous. Use proper grammar, maintain a business-appropriate tone, and be concise but warm.',
  friendly:
    'Friendly and approachable. Use casual language, emojis where appropriate, and sound conversational.',
  formal:
    'Formal and respectful. Use honorifics (Mr./Ms.), avoid contractions, and maintain a dignified tone.',
  persuasive:
    'Persuasive and convincing. Highlight value propositions, create urgency tastefully, and encourage action.',
  empathetic:
    'Empathetic and understanding. Acknowledge concerns, show genuine care, and be supportive.',
  neutral:
    'Neutral and factual. Keep the tone balanced, objective, and straightforward without emotional coloring.',
};

// ---------------------------------------------------------------------------
// enhanceMessage
// ---------------------------------------------------------------------------

/**
 * Enhance a message to match the desired tone using AI.
 *
 * Falls back to basic rule-based improvements when LLM is unavailable.
 */
export async function enhanceMessage(
  message: string,
  context?: EnhancementContext,
): Promise<{ enhanced: string; tone: MessageTone; llmUsed: boolean }> {
  const tone = context?.preferredTone ?? 'professional';
  const toneDesc = TONE_DESCRIPTIONS[tone];

  const systemPrompt = `You are a professional real estate communication assistant for EstateFlow CRM.

Your task is to rewrite the given message to match the specified tone while:
1. Preserving all factual information
2. Improving clarity and readability
3. Making the message sound natural for the given tone
4. Adding appropriate salutations and closings

Tone: ${tone}
Description: ${toneDesc}

${context?.leadName ? `Recipient name: ${context.leadName}` : ''}
${context?.stage ? `Conversation stage: ${context.stage}` : ''}
${context?.propertyTitle ? `Property: ${context.propertyTitle}` : ''}
${context?.additionalContext ? `Additional context: ${context.additionalContext}` : ''}

Return ONLY the rewritten message. Do not include explanations.`;

  const llmResult = await callLLM(systemPrompt, message);

  if (llmResult.content) {
    return {
      enhanced: llmResult.content,
      tone,
      llmUsed: true,
    };
  }

  // Fallback: rule-based enhancement
  return {
    enhanced: fallbackEnhance(message, tone, context),
    tone,
    llmUsed: false,
  };
}

/**
 * Basic rule-based message enhancement fallback.
 */
function fallbackEnhance(
  message: string,
  tone: MessageTone,
  context?: EnhancementContext,
): string {
  let result = message.trim();

  // Capitalize first letter
  result = result.charAt(0).toUpperCase() + result.slice(1);

  // Add greeting based on tone
  const greeting = context?.leadName
    ? tone === 'formal'
      ? `Dear ${context.leadName},\n\n`
      : tone === 'friendly'
        ? `Hi ${context.leadName}! 👋\n\n`
        : `Hi ${context.leadName},\n\n`
    : '';

  // Add closing based on tone
  const closings: Record<MessageTone, string> = {
    professional: '\n\nBest regards',
    friendly: '\n\nThanks! 😊',
    formal: '\n\nYours sincerely',
    persuasive: '\n\nLooking forward to your response',
    empathetic: '\n\nWishing you the best',
    neutral: '',
  };

  const closing = tone === 'neutral' ? '' : (closings[tone] ?? '');

  // Ensure message ends with proper punctuation
  if (!/[.!?]/.test(result.slice(-1))) {
    result += '.';
  }

  return `${greeting}${result}${closing}`.trim();
}

// ---------------------------------------------------------------------------
// translateMessage
// ---------------------------------------------------------------------------

/**
 * Translate a message between Hindi and English.
 */
export async function translateMessage(
  message: string,
  targetLanguage: TargetLanguage,
): Promise<{ translated: string; language: string; llmUsed: boolean; error?: string }> {
  const normalizedLang = targetLanguage === 'hindi' ? 'hi' : targetLanguage === 'english' ? 'en' : targetLanguage;
  const langName = normalizedLang === 'hi' ? 'Hindi' : 'English';

  const config = getLLMConfig();
  if (!config) {
    // Fallback: basic transliteration/hints
    return {
      translated: message,
      language: langName,
      llmUsed: false,
      error: 'No LLM configured for translation',
    };
  }

  const systemPrompt = `You are a real estate translator. Translate the following message to ${langName}.

Requirements:
- Keep real estate terminology accurate
- Preserve numbers, prices, and URLs exactly
- Maintain the original tone (professional/friendly)
- For Hindi: use Devanagari script
- For English: use proper grammar

Return ONLY the translated message.`;

  const llmResult = await callLLM(systemPrompt, message);

  if (llmResult.content) {
    return {
      translated: llmResult.content,
      language: langName,
      llmUsed: true,
    };
  }

  return {
    translated: message,
    language: langName,
    llmUsed: false,
    error: llmResult.error ?? 'Translation failed',
  };
}

// ---------------------------------------------------------------------------
// personalizeMessage
// ---------------------------------------------------------------------------

/**
 * Personalize a message by inserting lead-specific details.
 *
 * Replaces placeholders like {{name}}, {{property}}, {{location}} with
 * actual values from the lead and context objects.
 */
export function personalizeMessage(
  message: string,
  lead: {
    fullName?: string;
    firstName?: string;
    phone?: string;
    email?: string;
    [key: string]: unknown;
  },
  context?: {
    propertyTitle?: string;
    location?: string;
    budget?: string;
    [key: string]: unknown;
  },
): string {
  let result = message;

  const replacements: Record<string, string> = {};

  // Lead fields
  if (lead.fullName) replacements.name = lead.fullName;
  if (lead.firstName) replacements.firstName = lead.firstName;
  if (lead.fullName) {
    replacements.firstName = replacements.firstName ?? lead.fullName.split(' ')[0]!;
  }
  if (lead.phone) replacements.phone = lead.phone;
  if (lead.email) replacements.email = lead.email;

  // Context fields
  if (context?.propertyTitle) replacements.property = context.propertyTitle;
  if (context?.location) replacements.location = context.location;
  if (context?.budget) replacements.budget = context.budget;

  // Apply replacements
  for (const [key, value] of Object.entries(replacements)) {
    result = result.replace(
      new RegExp(`\\{\\{${key}\\}\\}`, 'gi'),
      value,
    );
  }

  return result;
}

// ---------------------------------------------------------------------------
// suggestResponse
// ---------------------------------------------------------------------------

/**
 * Suggest a reply to an incoming message based on context.
 */
export async function suggestResponse(
  incomingMessage: string,
  context?: SuggestionContext,
): Promise<{
  suggestions: string[];
  llmUsed: boolean;
  error?: string;
}> {
  const config = getLLMConfig();
  if (!config) {
    // Rule-based fallback suggestions
    return {
      suggestions: getFallbackSuggestions(incomingMessage),
      llmUsed: false,
    };
  }

  const historyText = context?.conversationHistory?.length
    ? `\n\nRecent conversation:\n${context.conversationHistory.join('\n')}`
    : '';

  const systemPrompt = `You are a helpful real estate sales assistant. Given an incoming message from a lead, suggest 3 concise and effective replies.

Context:
${context?.leadName ? `Lead name: ${context.leadName}` : ''}
${context?.propertyTitle ? `Property: ${context.propertyTitle}` : ''}
${context?.stage ? `Stage: ${context.stage}` : ''}
${historyText}

Requirements:
- Each suggestion should be 1-2 sentences
- Be professional yet warm
- Aim to move the conversation forward
- Include relevant property/lead details
- Number suggestions 1, 2, 3

Return ONLY the numbered suggestions, one per line.`;

  const llmResult = await callLLM(systemPrompt, `Incoming message: "${incomingMessage}"`);

  if (llmResult.content) {
    const suggestions = llmResult.content
      .split('\n')
      .map((s) => s.replace(/^\d+[.)\s]+/, '').trim())
      .filter((s) => s.length > 0)
      .slice(0, 5);

    return {
      suggestions: suggestions.length > 0 ? suggestions : getFallbackSuggestions(incomingMessage),
      llmUsed: true,
    };
  }

  return {
    suggestions: getFallbackSuggestions(incomingMessage),
    llmUsed: false,
    error: llmResult.error,
  };
}

/**
 * Rule-based fallback suggestions based on common real estate scenarios.
 */
function getFallbackSuggestions(message: string): string[] {
  const lower = message.toLowerCase();

  // Price/budget related
  if (/\b(price|cost|rate|budget|how much|payment|emi|loan)\b/.test(lower)) {
    return [
      'Thank you for your interest! The price is ₹[amount]. Would you like to schedule a site visit?',
      'I would be happy to discuss pricing options. Are you available for a call this week?',
      'We have flexible payment plans available. Would you like me to share the details?',
    ];
  }

  // Site visit / appointment related
  if (/\b(visit|see|tour|show|view|inspect|appointment|schedule|when can i)\b/.test(lower)) {
    return [
      'I would be happy to arrange a site visit. What time works best for you this week?',
      'Great! Let me check available slots. Are mornings or evenings better for you?',
      'I can schedule a visit at your convenience. Would you like to bring anyone along?',
    ];
  }

  // Property details / info
  if (/\b(detail|info|tell me|more about|feature|amenities|specification)\b/.test(lower)) {
    return [
      'I would be happy to share more details. Would you like information about specific features?',
      'This property offers excellent amenities. Would you like me to send a detailed brochure?',
      'Let me connect you with our expert who can walk you through all the features in detail.',
    ];
  }

  // Comparison / options
  if (/\b(other|alternative|compare|option|different|similar|anything else)\b/.test(lower)) {
    return [
      'We have several similar options available. What is your preferred budget range?',
      'I can show you a few alternatives. Do you have any specific requirements in mind?',
      'Let me share a few more options that match your criteria.',
    ];
  }

  // Greeting / initial contact
  if (/\b(hi|hello|hey|good morning|good evening|interested|looking for)\b/.test(lower)) {
    return [
      'Thank you for reaching out! How can I assist you with your property search today?',
      'Welcome! I would be happy to help you find the perfect property. What are you looking for?',
      'Great to hear from you! Would you like to start with a specific property or tell me your requirements?',
    ];
  }

  // Default suggestions
  return [
    'Thank you for your message. Let me look into this and get back to you shortly.',
    'I appreciate your interest. Could you share a bit more about your requirements?',
    'I would be happy to assist you with this. Would you like to schedule a call to discuss further?',
  ];
}
