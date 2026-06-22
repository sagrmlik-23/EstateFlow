// ============================================================================
// EstateFlow CRM — NLU Engine (Natural Language Understanding)
// Phase 5 — AI Chatbot (AGENT-5-1-CHATBOT-ENGINE)
// ============================================================================
//
// Intent classification and entity extraction for the chatbot.
// Supports Hindi, English, and Hinglish (mixed) input.
// Uses keyword matching + regex patterns for India real estate queries.
// ============================================================================

import type { ChatIntent, NLUResult, NLUEntity } from '@/types/chatbot';

// ============================================================================
// Intent Classification Patterns
// ============================================================================

interface IntentPattern {
  intent: ChatIntent;
  patterns: RegExp[];
  keywords: string[];
  weight: number; // priority weight for tie-breaking
}

const INTENT_PATTERNS: IntentPattern[] = [
  {
    intent: 'greeting',
    patterns: [
      /\b(hi|hello|hey|namaste|namaskar|vanakam|kem cho|kaise ho|namaskaram)\b/i,
      /\b(good\s*(morning|afternoon|evening|day))\b/i,
      /^(hey|hi|hello|hii|hlo|helo)\s*$/i,
      /\b(namastey|namste|namaste)\b/i,
    ],
    keywords: ['hi', 'hello', 'hey', 'namaste', 'namaskar', 'good morning', 'good evening'],
    weight: 1,
  },
  {
    intent: 'property_search',
    patterns: [
      /\b(show|search|find|looking\s*for|need|want|dikhay|dikhao|chahiye|chaiye|dhundo|doondh)\b/i,
      /\b(flat|apartment|house|villa|plot|property|ghar|makan|home|banglow|bungalow)\b/i,
      /\b(khareeda|kharidna|buy|rent|lease|kraya|kirchya)\b/i,
    ],
    keywords: ['show', 'search', 'looking', 'property', 'flat', 'house', 'buy', 'rent', 'chahiye', 'dikhao'],
    weight: 3,
  },
  {
    intent: 'price_inquiry',
    patterns: [
      /\b(price|cost|rate|kitna|daam|dam|mulya|budget|range)\b/i,
      /\b(₹\s*\d+|\d+\s*(lakh|lac|lacs|lkahs|cr|crore|k|hajar|hazaar))\b/i,
      /\b(how\s*much|what.?\s*price|price\s*kya)\b/i,
      /\b(kitne\s*ka|kitne\s*ki|price\s*batao|daam\s*batao|cost\s*kya)\b/i,
    ],
    keywords: ['price', 'cost', 'rate', 'kitna', 'budget', 'daam', 'lakh', 'crore'],
    weight: 3,
  },
  {
    intent: 'location_query',
    patterns: [
      /\b(kahan|kaha|kahaan|location|area|sector|phase|colony|nagar|vihar|extension|road)\b/i,
      /\b(in\s+\w+|near\s+\w+|close\s+to)\b/i,
      /\b(location\s*batao|kahan\s*hai|area\s*mein)\b/i,
    ],
    keywords: ['location', 'area', 'kahan', 'sector', 'near', 'colony'],
    weight: 2,
  },
  {
    intent: 'schedule_visit',
    patterns: [
      /\b(schedule|book|fix|set\s*up|plan|arrange|visit|dekhna|dekhte|dikhana)\b/i,
      /\b(site\s*visit|visit\s*karna|dekhne\s*aana|property\s*dekhni)\b/i,
      /\b(milna|meeting|appointment|slot|time\s*dedo|kab\s*dikhaoge|kab\s*dikhate)\b/i,
      /\b(visit\s*(karna|karne|karein|karwao))\b/i,
    ],
    keywords: ['visit', 'schedule', 'book', 'appointment', 'dekhna', 'site visit'],
    weight: 4,
  },
  {
    intent: 'contact_agent',
    patterns: [
      /\b(agent|broker|consultant|representative|expert|person|human|real\s*person)\b/i,
      /\b(talk\s*to|speak\s*to|connect\s*with|call\s*me|call\s*karo|baat\s*karni|baat\s*karo)\b/i,
      /\b(contact\s*number|phone|mobile|call\s*back|agent\s*se\s*baat)\b/i,
    ],
    keywords: ['agent', 'talk', 'speak', 'connect', 'call', 'baat', 'human'],
    weight: 4,
  },
  {
    intent: 'site_visit',
    patterns: [
      /\b(site\s*visit|visit\s*site|location\s*visit|project\s*visit|physical\s*visit)\b/i,
      /\b(dekhna\s*chahunga|dekhna\s*chahati|dekhna\s*chahta|dekhni\s*hai)\b/i,
      /\b(property\s*dekhni|flat\s*dekhna|ghar\s*dekhna|site\s*pe\s*jaana)\b/i,
    ],
    keywords: ['site visit', 'visit site', 'project visit', 'dekhna chahta', 'dekhni hai'],
    weight: 3,
  },
  {
    intent: 'handoff',
    patterns: [
      /\b(manager|owner|senior|supervisor|boss|higher|escalate|complaint)\b/i,
      /\b(not\s*helping|not\s*working|not\s*good|waste|useless|worst|kharaab|kharab)\b/i,
      /\b(negative|frustrated|angry|upset|dissatisfied|fed\s*up)\b/i,
      /\b(human\s*agent|real\s*agent|talk\s*to\s*human|human\s*se\s*baat)\b/i,
    ],
    keywords: ['manager', 'human', 'escalate', 'complaint', 'kharab', 'frustrated'],
    weight: 5,
  },
];

// ============================================================================
// Pattern-based Entity Extraction
// ============================================================================

const ENTITY_PATTERNS: Record<string, RegExp[]> = {
  budget: [
    // ₹ symbols with amounts
    /(?:₹|rs\.?\s*)?(\d+[,\d]*)\s*(lakh|lac|lacs|lkahs|k|cr|crore|crs?|hajar|hazaar|thousand|million)/gi,
    // Just numbers that look like budget
    /(?:budget|range|under|upto|up\s*to|less\s*than|max|maximum)\s*(?:of\s*)?(?:₹|rs\.?\s*)?(\d+[,\d]*)\s*(lakh|lac|lacs|cr|crore|crs?|k|thousand)?/gi,
    // Pure number patterns with L/Cr suffix
    /(\d+[.,]?\d*)\s*(?:lakh|lac|lkh|cr|crore|cr)\b/gi,
    // "50 lakhs", "1 crore", "30L", "2Cr"
    /(\d+)\s*(?:L|lakh|lac|cr|crore)\b/gi,
  ],
  location: [
    // Common Indian cities
    /\b(mumbai|delhi|bangalore|bengaluru|pune|hyderabad|chennai|kolkata|ahmedabad|jaipur|lucknow|noida|gurgaon|gurugram|faridabad|ghaziabad|indore|bhopal|chandigarh|surat|vadodara|nagpur|thane|navi\s*mumbai|kochi|coimbatore|vizag|visakhapatnam|goa|dehradun|agra|varanasi|patna|ranchi|bhubaneswar|amritsar|kanpur|meerut|ludhiana|nashik|aurangabad|raipur|jodhpur|udaipur)\b/i,
    // Areas/sectors/colonies
    /\b(sector\s*\d+|phase\s*\d+|block\s*\w+)\b/i,
    /\b(\w+\s*(nagar|vihar|extension|colony|layout|enclave|garden|park|society|apartment|tower|complex|villa))\b/i,
    // Generic location patterns
    /\b(?:area|location|sector|zone|region)\s*(?:\sof\s*)?[:：]?\s*(\w+(?:\s+\w+)?)/i,
    /\bin\s+(\w+(?:\s+\w+)?)\s*(?:area|region|location|sector)?\b/i,
    /\b(near|close\s*to|beside|opposite|around)\s+(\w+(?:\s+\w+)?)/i,
  ],
  propertyType: [
    /\b(\d+\s*bhk|studio|1rk)\b/i,
    /\b(flat|apartment|house|villa|bungalow|plot|land|penthouse|duplex|triplex|row\s*house|townhouse)\b/i,
    /\b(commercial|residential|shop|office|godown|warehouse|showroom)\b/i,
    /\b(banglow|bunglow|independent\s*(house|floor)|builder\s*floor)\b/i,
  ],
  bedrooms: [
    /\b(\d+)\s*(bhk|bedroom|bed\s*room|room|bed|rk|b.r)\b/i,
    /\b(bhk|bedroom)\s*(\d+)\b/i,
    /\b(studio)\b/i,
    /(\d+)-?bhk/i,
  ],
  timeline: [
    /\b(immediately|urgent|asap|as\s*soon\s*as\s*possible|jald|jaldi|jaldi\s*se|turant|abhi|now|today|aaj)\b/i,
    /\b(this|next|coming)\s*(week|month|year|sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i,
    /\b(within|in)\s*(\d+\s*(days?|weeks?|months?|hours?))\b/i,
    /\b(agla|agli|next)\s*(hafta|mahina|week|month)\b/i,
    /\b(kal|parson|aaj|aj|today|tomorrow)\b/i,
  ],
  name: [
    /\b(myself|my\s*name\s*is|i'm|i\s*am|mera\s*naam|mera\s*nam|name|naam)\s+(\w+(?:\s+\w+)?)/i,
    /\b(main|mein)\s+(\w+(?:\s+\w+)?)\s+(hu|hoon|hunt)\b/i,
    /^(?:main|mein)\s+(\w+(?:\s+\w+)?)\b/i,
  ],
  phone: [
    /(\+?91[-\s]?)?\d{10}/g,
    /(\+?91[-\s]?)?\d{5}[-\s]?\d{5}/g,
    /(?:phone|mobile|call|whatsapp|number|contact|mob|ph)\s*(?:no|number|num)?[:：]?\s*(\+?91[-\s]?)?\d{10}/i,
    /(?:phone|mobile|call|whatsapp|number|contact)\s*(?:no|number|num)?[:：]?\s*(\+?91[-\s]?)?\d{5}[-\s]?\d{5}/i,
  ],
  email: [
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    /(?:email|mail|e-mail|e mail|id)\s*(?:id|address)?[:：]?\s*(\S+@\S+\.\S+)/i,
  ],
};

// ============================================================================
// Stopwords (Hindi + English)
// ============================================================================

const STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'can', 'could',
  'shall', 'should', 'may', 'might', 'must', 'to', 'of', 'in', 'for', 'on',
  'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during', 'before',
  'after', 'above', 'below', 'between', 'out', 'off', 'over', 'under',
  'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where',
  'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more', 'most',
  'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same',
  'so', 'than', 'too', 'very', 'just', 'because', 'but', 'and', 'or',
  'if', 'while', 'about', 'up', 'i', 'me', 'my', 'myself', 'we', 'our',
  'you', 'your', 'he', 'him', 'his', 'she', 'her', 'it', 'its', 'they',
  'them', 'their', 'what', 'which', 'who', 'whom', 'this', 'that', 'these',
  'those', 'am', 'ko', 'ka', 'ki', 'ke', 'se', 'mein', 'main', 'aur',
  'hai', 'hain', 'ho', 'hoga', 'hogi', 'tha', 'the', 'thi', 'theen',
  'yeh', 'ye', 'woh', 'wo', 'us', 'un', 'is', 'unke', 'inka', 'unka',
  'apna', 'apni', 'apne', 'kya', 'kyun', 'kaise', 'kab', 'kahan',
  'bahut', 'thoda', 'thodi', 'thode', 'kuch', 'saara', 'saari',
]);

// ============================================================================
// Hindi/Hinglish normalization mapping
// ============================================================================

const HINGLISH_NORMALIZE: Record<string, string> = {
  'namaste': 'hello',
  'namaskar': 'hello',
  'dikhao': 'show',
  'dikhay': 'show',
  'dikha': 'show',
  'chahiye': 'want',
  'chaiye': 'want',
  'chahie': 'want',
  'dhundo': 'search',
  'doondh': 'search',
  'kharidna': 'buy',
  'kharidunga': 'buy',
  'kharidogi': 'buy',
  'kraya': 'rent',
  'kirchya': 'rent',
  'kitna': 'price',
  'daam': 'price',
  'dam': 'price',
  'mol': 'price',
  'batao': 'tell',
  'bata': 'tell',
  'kahan': 'where',
  'kaha': 'where',
  'dekhna': 'visit',
  'dekhni': 'visit',
  'dekhunga': 'visit',
  'dekhogi': 'visit',
  'dikhana': 'show',
  'dikhaana': 'show',
  'aana': 'come',
  'jaana': 'go',
  'baat': 'talk',
  'karo': 'do',
  'karni': 'do',
  'karein': 'do',
  'karwao': 'get done',
  'turant': 'immediately',
  'jald': 'quick',
  'jaldi': 'quickly',
  'abhi': 'now',
  'aaj': 'today',
  'kal': 'tomorrow',
  'parson': 'day after',
  'ghar': 'house',
  'makan': 'house',
  'banglow': 'bungalow',
  'bunglow': 'bungalow',
  'sasti': 'cheap',
  'sasta': 'cheap',
  'mhenga': 'expensive',
  'mehnga': 'expensive',
  'acha': 'good',
  'accha': 'good',
  'kharab': 'bad',
  'kharaab': 'bad',
  'umda': 'excellent',
  'badhiya': 'great',
  'naya': 'new',
  'purana': 'old',
  'milna': 'meet',
  'milunga': 'meet',
  'samajh': 'understand',
  'samajhna': 'understand',
  'pata': 'know',
  'maloom': 'know',
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Normalize Hinglish input — replace Hindi/Hinglish words with English equivalents.
 */
function normalizeHinglish(text: string): string {
  let normalized = text.toLowerCase().trim();

  for (const [hinglish, english] of Object.entries(HINGLISH_NORMALIZE)) {
    // Match whole words only
    const regex = new RegExp(`\\b${hinglish}\\b`, 'gi');
    normalized = normalized.replace(regex, english);
  }

  return normalized;
}

/**
 * Check if text contains any of the given keywords.
 */
function hasKeywords(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((kw) => lower.includes(kw.toLowerCase()));
}

/**
 * Count keyword matches in text.
 */
function countKeywordMatches(text: string, keywords: string[]): number {
  const lower = text.toLowerCase();
  return keywords.filter((kw) => lower.includes(kw.toLowerCase())).length;
}

// ============================================================================
// classifyIntent — Determine intent from user message
// ============================================================================

/**
 * Classify the user's intent from their message.
 * Supports Hindi, English, and Hinglish input.
 *
 * @param message - The user's raw message text
 * @returns The detected intent
 */
export function classifyIntent(message: string): { intent: ChatIntent; confidence: number } {
  const normalized = normalizeHinglish(message);
  const lower = message.toLowerCase();

  let bestIntent: ChatIntent = 'general_query';
  let bestScore = 0;

  for (const ip of INTENT_PATTERNS) {
    let score = 0;

    // Check regex patterns
    for (const pattern of ip.patterns) {
      const matches = lower.match(pattern);
      if (matches) {
        score += matches.length * 15;
      }
      // Also check normalized text
      const normMatches = normalized.match(pattern);
      if (normMatches) {
        score += normMatches.length * 10;
      }
    }

    // Check keywords
    const keywordCount = countKeywordMatches(normalized, ip.keywords);
    score += keywordCount * 12;

    // Apply intent weight
    score *= ip.weight;

    // Bonus for multi-pattern match (more confident)
    if (score > bestScore) {
      bestScore = score;
      bestIntent = ip.intent;
    }
  }

  // Normalize confidence
  const confidence = Math.min(bestScore / 100, 0.98);

  return { intent: bestIntent, confidence };
}

// ============================================================================
// extractEntities — Extract entities from user message
// ============================================================================

/**
 * Extract structured entities from a user message.
 * Handles Indian real estate terminology in Hindi/English/Hinglish.
 *
 * @param message - The user's raw message
 * @returns Extracted entities with text, value, and confidence
 */
/**
 * Helper: iterate over matchAll results compatibly with ES2017.
 */
function getAllMatches(text: string, pattern: RegExp): RegExpExecArray[] {
  const matches: RegExpExecArray[] = [];
  const regex = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    matches.push(match);
    // Avoid infinite loops on zero-length matches
    if (match.index === regex.lastIndex) regex.lastIndex++;
  }
  return matches;
}

export function extractEntities(message: string): NLUResult['entities'] {
  const entities: NLUResult['entities'] = {};
  const lower = message.toLowerCase();

  // ── Budget extraction ───────────────────────────────────────────────────
  const budgetPatterns = ENTITY_PATTERNS['budget'];
  if (budgetPatterns) {
    for (const pattern of budgetPatterns) {
      const matches = getAllMatches(lower, pattern);
      for (const match of matches) {
        try {
          const fullMatch = match[0];
          const numStr = match[1] ? match[1].replace(/,/g, '') : '';
          const suffixRaw = match[2]
            || (match[0].match(/lakh|lac|cr|crore|k|thousand/i)?.[0])
            || '';
          const suffixPart = suffixRaw.toLowerCase();
          const num = parseFloat(numStr);
          if (!numStr || isNaN(num)) continue;

          let valueInRupees: number;
          if (suffixPart.includes('cr') || suffixPart.includes('crore')) {
            valueInRupees = num * 10_000_000;
          } else if (suffixPart.includes('lakh') || suffixPart.includes('lac')) {
            valueInRupees = num * 100_000;
          } else if (suffixPart.includes('k') || suffixPart.includes('thousand')) {
            valueInRupees = num * 1_000;
          } else if (num >= 100000) {
            valueInRupees = num;
          } else {
            valueInRupees = num * 100_000; // treat bare number as lakhs
          }

          if (valueInRupees >= 100_000) {
            entities.budget = { text: fullMatch, value: valueInRupees, confidence: 0.85 };
            break;
          }
        } catch {
          // skip invalid
        }
      }
      if (entities.budget) break;
    }
  }

  // ── Location extraction ────────────────────────────────────────────────
  const locationPatterns = ENTITY_PATTERNS['location'];
  if (locationPatterns) {
    for (const pattern of locationPatterns) {
      const matches = getAllMatches(lower, pattern);
      for (const match of matches) {
        if (match[0] && match[0].length > 2) {
          const location = match[1] || match[2] || match[0];
          if (location && location.length > 2 && !STOPWORDS.has(location.toLowerCase())) {
            entities.location = {
              text: match[0],
              value: location.replace(/^(in|near|at|on|around|beside|opposite)\s+/i, '').trim(),
              confidence: 0.75,
            };
            break;
          }
        }
      }
      if (entities.location) break;
    }
  }

  // ── Property type extraction ───────────────────────────────────────────
  const typePatterns = ENTITY_PATTERNS['propertyType'];
  if (typePatterns) {
    for (const pattern of typePatterns) {
      const matches = getAllMatches(lower, pattern);
      for (const match of matches) {
        if (match[0]) {
          let propType = match[0].toLowerCase().trim();
          const bhkMatch = propType.match(/(\d+)\s*bhk/);
          if (bhkMatch) {
            propType = `${bhkMatch[1]}BHK`;
            if (!entities.bedrooms) {
              entities.bedrooms = {
                text: match[0], value: parseInt(bhkMatch[1] ?? '0'), confidence: 0.9,
              };
            }
          } else if (propType === 'studio') {
            propType = 'Studio';
            if (!entities.bedrooms) {
              entities.bedrooms = { text: match[0], value: 0, confidence: 0.9 };
            }
          }
          entities.propertyType = { text: match[0], value: propType, confidence: 0.8 };
          break;
        }
      }
      if (entities.propertyType) break;
    }
  }

  // ── Bedrooms extraction (if not already captured) ──────────────────────
  if (!entities.bedrooms) {
    const bedroomPatterns = ENTITY_PATTERNS['bedrooms'];
    if (bedroomPatterns) {
      for (const pattern of bedroomPatterns) {
        const matches = getAllMatches(lower, pattern);
        for (const match of matches) {
          if (match[1] === 'studio') {
            entities.bedrooms = { text: match[0], value: 0, confidence: 0.9 };
          } else {
            const num = parseInt(match[1] || match[2] || '');
            if (num >= 1 && num <= 10) {
              entities.bedrooms = { text: match[0], value: num, confidence: 0.9 };
              break;
            }
          }
        }
        if (entities.bedrooms) break;
      }
    }
  }

  // ── Timeline extraction ────────────────────────────────────────────────
  const timelinePatterns = ENTITY_PATTERNS['timeline'];
  if (timelinePatterns) {
    for (const pattern of timelinePatterns) {
      const matches = getAllMatches(lower, pattern);
      for (const match of matches) {
        if (match[0]) {
          const timeline = match[0].toLowerCase();
          let normalizedTimeline = timeline;
          if (/abhi|now|urgent|jald|asap|immediately|today|aaj|turant/.test(timeline)) {
            normalizedTimeline = 'immediately';
          } else if (/kal|tomorrow/.test(timeline)) {
            normalizedTimeline = 'tomorrow';
          } else if (/this\s*week|iss\s*hafta/.test(timeline)) {
            normalizedTimeline = 'this_week';
          } else if (/next\s*week|agle\s*hafta/.test(timeline)) {
            normalizedTimeline = 'next_week';
          } else if (/this\s*month/.test(timeline)) {
            normalizedTimeline = 'this_month';
          } else if (/next\s*month/.test(timeline)) {
            normalizedTimeline = 'next_month';
          }
          entities.timeline = { text: match[0], value: normalizedTimeline, confidence: 0.7 };
          break;
        }
      }
      if (entities.timeline) break;
    }
  }

  // ── Name extraction ────────────────────────────────────────────────────
  const namePatterns = ENTITY_PATTERNS['name'];
  if (namePatterns) {
    for (const pattern of namePatterns) {
      const matches = getAllMatches(lower, pattern);
      for (const match of matches) {
        if (match[1] && match[1].length > 1 && !STOPWORDS.has(match[1].toLowerCase())) {
          const name = match[1]
            .split(' ')
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' ');
          entities.name = { text: match[0], value: name, confidence: 0.7 };
          break;
        }
      }
      if (entities.name) break;
    }
  }

  // ── Phone extraction ───────────────────────────────────────────────────
  const phonePatterns = ENTITY_PATTERNS['phone'];
  if (phonePatterns) {
    for (const pattern of phonePatterns) {
      const matches = getAllMatches(lower, pattern);
      for (const match of matches) {
        const phone = match[0] ? match[0].replace(/[^+\d]/g, '') : '';
        if (phone.length >= 10) {
          const normalizedPhone = phone.length === 10 ? `+91${phone}`
            : phone.startsWith('91') && phone.length === 12 ? `+${phone}`
            : phone.startsWith('+') ? phone
            : `+91${phone.replace(/^0+/, '')}`;
          entities.phone = { text: match[0], value: normalizedPhone, confidence: 0.9 };
          break;
        }
      }
      if (entities.phone) break;
    }
  }

  // ── Email extraction ───────────────────────────────────────────────────
  const emailPatterns = ENTITY_PATTERNS['email'];
  if (emailPatterns) {
    for (const pattern of emailPatterns) {
      const matches = getAllMatches(message, pattern);
      for (const match of matches) {
        const email = match[1] || match[0];
        if (email && email.includes('@')) {
          entities.email = {
            text: match[0],
            value: email.replace(/^.+?[:：]\s*/, ''),
            confidence: 0.95,
          };
          break;
        }
      }
      if (entities.email) break;
    }
  }

  return entities;
}

// ============================================================================
// calculateConfidence — Compute overall NLU confidence
// ============================================================================

/**
 * Calculate overall NLU confidence based on intent + entity extraction quality.
 */
function calculateConfidence(intentResult: { intent: ChatIntent; confidence: number }, entities: NLUResult['entities']): number {
  const entityCount = Object.keys(entities).length;
  const entityBonus = Math.min(entityCount * 0.05, 0.2);
  return Math.min(intentResult.confidence + entityBonus, 0.99);
}

// ============================================================================
// processNLU — Full NLU pipeline
// ============================================================================

/**
 * Process a user message through the full NLU pipeline:
 * 1. Normalize Hinglish input
 * 2. Classify intent
 * 3. Extract entities
 *
 * @param message - The user's raw message
 * @returns Complete NLU result with intent, confidence, entities, and original query
 */
export function processNLU(message: string): NLUResult {
  const intentResult = classifyIntent(message);
  const entities = extractEntities(message);
  const confidence = calculateConfidence(intentResult, entities);

  return {
    intent: intentResult.intent,
    confidence,
    entities,
    originalQuery: message,
  };
}
