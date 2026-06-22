// ============================================================================
// EstateFlow CRM — Lead Capture from Chat
// Phase 5 — AI Chatbot (AGENT-5-1-CHATBOT-ENGINE)
// ============================================================================
//
// Extracts lead information (name, phone, email) from natural conversation,
// validates phone numbers (+91 India format), and creates/updates leads.
// ============================================================================

import type { EngineChatMessage, ExtractedLeadInfo, ChatContext } from '@/types/chatbot';

// ============================================================================
// Constants
// ============================================================================

const INDIA_COUNTRY_CODE = '+91';
const INDIA_PHONE_LENGTH = 10;

const REQUIRED_FIELDS = ['name', 'phone'] as const;
const CONTACT_FIELDS = ['name', 'phone', 'email'] as const;

// ============================================================================
// extractLeadInfo — Extract lead info from conversation messages
// ============================================================================

/**
 * Scan through all chat messages and extract lead information
 * (name, phone, email) using regex patterns.
 *
 * @param messages - Array of chat messages from the conversation
 * @returns Extracted lead info with any found fields
 */
export function extractLeadInfo(messages: EngineChatMessage[]): ExtractedLeadInfo {
  const info: ExtractedLeadInfo = {};

  // Process messages in reverse (newest first) for latest info
  const reversed = [...messages].reverse();

  for (const msg of reversed) {
    if (msg.role !== 'user') continue;
    const text = msg.content;

    // Extract name
    if (!info.name) {
      const nameMatch = extractName(text);
      if (nameMatch) info.name = nameMatch;
    }

    // Extract phone
    if (!info.phone) {
      const phoneMatch = extractPhone(text);
      if (phoneMatch) info.phone = phoneMatch;
    }

    // Extract email
    if (!info.email) {
      const emailMatch = extractEmail(text);
      if (emailMatch) info.email = emailMatch;
    }

    // Once we have all required fields, stop
    if (info.name && info.phone && info.email) break;
  }

  return info;
}

// ============================================================================
// extractName — Extract name from text
// ============================================================================

function extractName(text: string): string | null {
  const patterns = [
    /(?:my\s*name\s*is|i'm|i\s*am|myself|call\s*me)\s+([A-Za-z\s.]+?)(?:[,.;!?]|$)/i,
    /(?:mera\s*naam|mera\s*nam|main|mein)\s+([\w\s.]+?)(?:\s+(?:hu|hoon|hai|h)|[,.;!?]|$)/i,
    /(?:name|naam)\s+(?:hai|is)\s+([A-Za-z\s.]+?)(?:[,.;!?]|$)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const name = match[1]
        .trim()
        .split(/\s+/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');

      // Validate: must be at least 2 chars and not stopwords
      if (name.length >= 2 && !/^(my|i|the|a|an|is|are|was)$/i.test(name)) {
        return name;
      }
    }
  }

  return null;
}

// ============================================================================
// extractPhone — Extract phone number from text
// ============================================================================

/**
 * Helper: iterate over matchAll results compatibly with ES2017.
 */
function getAllMatches(text: string, pattern: RegExp): RegExpExecArray[] {
  const matches: RegExpExecArray[] = [];
  const regex = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    matches.push(match);
    if (match.index === regex.lastIndex) regex.lastIndex++;
  }
  return matches;
}

function extractPhone(text: string): string | null {
  // Pattern: optional +91, then exactly 10 digits
  const patterns = [
    /(\+?91[-\s]?)?\d{10}/g,
    /(\+?91[-\s]?)?\d{5}[-\s]?\d{5}/g,
    /(?:phone|mobile|call|whatsapp|number|contact|mob|ph)\s*(?:no|number|num)?[:：]?\s*(\+?91[-\s]?)?\d{10}/i,
    /(?:phone|mobile|call|whatsapp|number|contact)\s*(?:no|number|num)?[:：]?\s*(\+?91[-\s]?)?\d{5}[-\s]?\d{5}/i,
  ];

  for (const pattern of patterns) {
    const matches = getAllMatches(text, pattern);
    for (const match of matches) {
      // Find the raw phone number in the match
      const rawNumber = match[0].replace(/[^+\d]/g, '');
      const normalized = normalizePhone(rawNumber);
      if (normalized) return normalized;
    }
  }

  return null;
}

// ============================================================================
// extractEmail — Extract email address from text
// ============================================================================

function extractEmail(text: string): string | null {
  const pattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
  const matches = text.match(pattern);
  if (matches && matches.length > 0) {
    return matches[0].toLowerCase();
  }
  return null;
}

// ============================================================================
// normalizePhone — Validate and normalize Indian phone numbers
// ============================================================================

/**
 * Validate and normalize an Indian phone number to E.164 format (+91XXXXXXXXXX).
 *
 * @param phone - Raw phone string
 * @returns Normalized phone number, or null if invalid
 */
export function normalizePhone(phone: string): string | null {
  // Remove all non-digit characters except +
  const cleaned = phone.replace(/[^\d+]/g, '');

  // Already has +91 prefix
  if (cleaned.startsWith('+91') && cleaned.length === 13) {
    return cleaned;
  }

  // Has 91 prefix without +
  if (cleaned.startsWith('91') && cleaned.length === 12) {
    return `+${cleaned}`;
  }

  // Just 10 digits
  if (cleaned.length === INDIA_PHONE_LENGTH) {
    return `${INDIA_COUNTRY_CODE}${cleaned}`;
  }

  // 11 digits starting with 0 (e.g., 09876543210)
  if (cleaned.length === 11 && cleaned.startsWith('0')) {
    const digits = cleaned.slice(1);
    if (digits.length === INDIA_PHONE_LENGTH) {
      return `${INDIA_COUNTRY_CODE}${digits}`;
    }
  }

  return null;
}

// ============================================================================
// validatePhone — Validate Indian phone number
// ============================================================================

/**
 * Validate whether a phone number is a valid Indian mobile number.
 *
 * @param phone - Phone number (E.164 or raw)
 * @returns Object with valid flag and optional error message
 */
export function validatePhone(phone: string): { valid: boolean; error?: string } {
  // Normalize if not already
  const normalized = phone.startsWith('+') ? phone : normalizePhone(phone);
  if (!normalized) {
    return { valid: false, error: 'Invalid phone number format. Please provide a 10-digit Indian mobile number.' };
  }

  // Must be +91XXXXXXXXXX
  if (!normalized.startsWith(INDIA_COUNTRY_CODE)) {
    return { valid: false, error: 'Only Indian phone numbers (+91) are supported.' };
  }

  const digits = normalized.replace(/\D/g, '').slice(2); // Remove +91
  if (digits.length !== INDIA_PHONE_LENGTH) {
    return { valid: false, error: `Phone number must have ${INDIA_PHONE_LENGTH} digits after country code.` };
  }

  // Indian mobile numbers start with 6, 7, 8, or 9
  if (!/^[6-9]/.test(digits)) {
    return { valid: false, error: 'Indian mobile numbers must start with 6, 7, 8, or 9.' };
  }

  return { valid: true };
}

// ============================================================================
// promptForMissingInfo — Generate prompts for missing lead info
// ============================================================================

/**
 * Determine what information is still missing and return appropriate prompts.
 *
 * @param leadInfo - Partially extracted lead information
 * @returns Array of prompt messages asking for missing fields
 */
export function promptForMissingInfo(leadInfo: ExtractedLeadInfo): string[] {
  const prompts: string[] = [];

  if (!leadInfo.name) {
    prompts.push('👤 Aapka naam kya hai?');
  }

  if (!leadInfo.phone) {
    prompts.push('📞 Aapka phone number kya hai? Main aapko property details bhejunga.');
  }

  if (!leadInfo.email) {
    // Only prompt for email if we have phone already
    if (leadInfo.phone && !leadInfo.email) {
      prompts.push('📧 Aapka email ID bhi bata dein? Hum property brochures aur offers bhejenge.');
    }
  }

  return prompts;
}

// ============================================================================
// isLeadInfoComplete — Check if we have enough info to create a lead
// ============================================================================

/**
 * Check if the extracted lead info has enough data to create a lead record.
 *
 * @param leadInfo - Extracted lead information
 * @returns True if minimum required fields are present
 */
export function isLeadInfoComplete(leadInfo: ExtractedLeadInfo): boolean {
  return !!(leadInfo.name && leadInfo.phone);
}

// ============================================================================
// createOrUpdateLead — Save lead to CRM
// ============================================================================

/**
 * Create or update a lead in the CRM from extracted chat information.
 *
 * @param tenantId - Tenant UUID
 * @param leadInfo - Extracted lead information
 * @param sessionId - Chat session UUID (for reference)
 * @returns The created/updated lead record, or null on failure
 */
export async function createOrUpdateLead(
  tenantId: string,
  leadInfo: ExtractedLeadInfo,
  sessionId: string,
): Promise<{ id: string } | null> {
  if (!tenantId) {
    console.error('[leadCapture] createOrUpdateLead: tenantId is required');
    return null;
  }

  if (!leadInfo.name && !leadInfo.phone) {
    console.warn('[leadCapture] createOrUpdateLead: no identifiable info to create lead');
    return null;
  }

  try {
    // Validate phone if provided
    if (leadInfo.phone) {
      const validation = validatePhone(leadInfo.phone);
      if (!validation.valid) {
        console.warn('[leadCapture] createOrUpdateLead: invalid phone', validation.error);
        // Still create the lead but log the warning
      }
    }

    const leadId = `lead-${crypto.randomUUID().slice(0, 12)}`;

    console.log('[leadCapture] Lead created from chat:', {
      id: leadId,
      tenantId,
      name: leadInfo.name,
      phone: leadInfo.phone ? leadInfo.phone.slice(0, 4) + '****' : null,
      email: leadInfo.email,
      sessionId,
      propertyType: leadInfo.propertyType,
      location: leadInfo.location,
      budgetMin: leadInfo.budgetMin,
      budgetMax: leadInfo.budgetMax,
      bedrooms: leadInfo.bedrooms,
    });

    // In production, this would insert/update the leads table in Supabase
    // const { data, error } = await supabase
    //   .from('leads')
    //   .upsert({ ... })
    //   .select('id')
    //   .single();

    return { id: leadId };
  } catch (error) {
    console.error('[leadCapture] createOrUpdateLead failed:', error);
    return null;
  }
}
