/**
 * Lead intake webhook processor for EstateFlow CRM.
 *
 * Parses incoming leads from external sources (Facebook Lead Ads,
 * Google Lead Forms, website forms) and normalizes them into the
 * internal lead schema. Handles deduplication, phone normalization,
 * and webhook callbacks.
 */

import type { LeadSourceValue } from '@/lib/constants';
import { LEAD_SOURCES } from '@/lib/constants';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface WebhookLeadData {
  source: LeadSourceValue;
  sourceId?: string;          // External ID from the source (e.g., Facebook lead ID)
  firstName: string;
  lastName: string;
  email?: string;
  phone: string;
  altPhone?: string;
  propertyType?: string;
  propertyInterest?: string;  // e.g., 'buy', 'rent', 'invest'
  budget?: number;
  city?: string;
  locality?: string;
  message?: string;
  metadata?: Record<string, unknown>;
}

export interface WebhookPayload {
  source: string;
  raw: Record<string, unknown>;
}

export interface ProcessedLead {
  id: string;
  tenantId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string;
  altPhone: string | null;
  source: LeadSourceValue;
  sourceId: string | null;
  propertyType: string | null;
  propertyInterest: string | null;
  budget: number | null;
  city: string | null;
  locality: string | null;
  message: string | null;
  status: string;
  assignedTo: string | null;
  metadata: Record<string, unknown> | null;
  duplicateOf: string | null;  // Lead ID if this is a duplicate
  createdAt: string;
}

export interface WebhookResult {
  success: boolean;
  lead: ProcessedLead | null;
  duplicate: boolean;
  duplicateOf: string | null;
  errors: string[];
}

// ─── Phone Normalization ────────────────────────────────────────────────────

/**
 * Normalize a phone number to +91 (India) format.
 *
 * Handles:
 *   - +91 prefix (already correct)
 *   - 0 prefix (replace with +91)
 *   - Raw 10-digit numbers
 *   - International codes other than +91 (left as-is)
 *
 * @param phone - Raw phone number string
 * @returns Normalized phone number
 */
export function normalizePhone(phone: string): string {
  if (!phone) return '';

  // Strip all non-numeric characters except leading +
  const cleaned = phone.replace(/[^\d+]/g, '');

  // If already in +91 format
  if (cleaned.startsWith('+91')) {
    // Ensure it's exactly +91 followed by 10 digits
    const digits = cleaned.replace(/\D/g, '');
    if (digits.length === 12) {
      return `+91${digits.slice(2)}`;
    }
    return cleaned;
  }

  // If starts with + followed by other country code, leave as-is
  if (cleaned.startsWith('+')) {
    return cleaned;
  }

  // If starts with 0 (e.g., 09876543210 → remove 0, add +91)
  if (cleaned.startsWith('0')) {
    const withoutZero = cleaned.slice(1);
    // Expect 10 digits after removing leading 0
    if (withoutZero.length === 10) {
      return `+91${withoutZero}`;
    }
    // If longer, might be STD code + number
    return `+91${withoutZero}`;
  }

  // If it's a plain 10-digit number (e.g., 9876543210)
  if (cleaned.length === 10) {
    return `+91${cleaned}`;
  }

  // If it's 11 digits and starts with 0 (e.g., 09987654321 → +919987654321)
  if (cleaned.length === 11 && cleaned.startsWith('0')) {
    return `+91${cleaned.slice(1)}`;
  }

  // If it's 12 digits starting with 91 (without +)
  if (cleaned.length === 12 && cleaned.startsWith('91')) {
    return `+${cleaned}`;
  }

  // For any other format, return as-is with + prefixed if missing
  return cleaned.startsWith('+') ? cleaned : `+${cleaned}`;
}

// ─── Duplicate Detection ────────────────────────────────────────────────────

/**
 * In-memory lead store for duplicate detection (stub).
 * In production, this queries the database.
 */
const leadPhoneIndex = new Map<string, string>(); // phone → leadId

/**
 * Check if a lead with the given phone number already exists for this tenant.
 *
 * @param phone    - Normalized phone number
 * @param tenantId - Tenant UUID
 * @returns Lead ID if a duplicate exists, null otherwise
 */
export async function detectDuplicate(
  phone: string,
  tenantId: string,
): Promise<string | null> {
  // In production:
  //   const { data } = await supabase
  //     .from('leads')
  //     .select('id')
  //     .eq('phone', phone)
  //     .eq('tenant_id', tenantId)
  //     .single();
  //   return data?.id ?? null;

  const compositeKey = `${tenantId}:${phone}`;
  return leadPhoneIndex.get(compositeKey) ?? null;
}

// ─── Source-Specific Parsers ────────────────────────────────────────────────

/**
 * Parse Facebook Lead Ads webhook payload into standard WebhookLeadData.
 */
function parseFacebookLead(webhookData: Record<string, unknown>): WebhookLeadData {
  const fieldData = (webhookData.field_data as Record<string, unknown>[]) ?? [];
  const fields = new Map<string, string>();

  for (const field of fieldData) {
    const name = field.name as string;
    const values = field.values as string[];
    if (name && values && values.length > 0) {
      fields.set(name.toLowerCase(), values[0]!);
    }
  }

  const fullName = (fields.get('full_name') ?? fields.get('name') ?? '').split(' ');
  const firstName = fullName[0] || '';
  const lastName = fullName.slice(1).join(' ') || '';

  return {
    source: LEAD_SOURCES.FACEBOOK,
    sourceId: webhookData.leadgen_id as string,
    firstName,
    lastName,
    email: fields.get('email'),
    phone: fields.get('phone_number') ?? fields.get('phone') ?? '',
    propertyType: fields.get('property_type'),
    propertyInterest: fields.get('interest') ?? fields.get('looking_for'),
    budget: fields.get('budget') ? Number(fields.get('budget')) : undefined,
    city: fields.get('city'),
    message: fields.get('message') ?? fields.get('comments'),
    metadata: { raw_facebook_data: webhookData },
  };
}

/**
 * Parse Google Lead Forms webhook payload into standard WebhookLeadData.
 */
function parseGoogleLead(webhookData: Record<string, unknown>): WebhookLeadData {
  const answers = (webhookData.answers as Record<string, unknown>[]) ?? [];
  const fields = new Map<string, string>();

  for (const answer of answers) {
    const question = (answer.question as string ?? '').toLowerCase();
    const value = answer.value as string ?? '';

    if (question.includes('name')) {
      const existing = fields.get('name') ?? '';
      fields.set('name', existing ? `${existing} ${value}` : value);
    } else if (question.includes('email')) {
      fields.set('email', value);
    } else if (question.includes('phone') || question.includes('mobile')) {
      fields.set('phone', value);
    } else if (question.includes('budget') || question.includes('price')) {
      fields.set('budget', value);
    } else if (question.includes('city') || question.includes('location')) {
      fields.set('city', value);
    } else if (question.includes('property') || question.includes('type')) {
      fields.set('property_type', value);
    } else if (question.includes('message') || question.includes('comment')) {
      fields.set('message', value);
    }
  }

  const fullName = (fields.get('name') ?? '').split(' ');
  const firstName = fullName[0] || '';
  const lastName = fullName.slice(1).join(' ') || '';

  return {
    source: LEAD_SOURCES.WEBSITE,
    sourceId: webhookData.form_response_id as string,
    firstName,
    lastName,
    email: fields.get('email'),
    phone: fields.get('phone') ?? '',
    propertyType: fields.get('property_type'),
    propertyInterest: fields.get('interest'),
    budget: fields.get('budget') ? Number(fields.get('budget')) : undefined,
    city: fields.get('city'),
    message: fields.get('message'),
    metadata: { raw_google_data: webhookData },
  };
}

/**
 * Parse a generic website form submission into standard WebhookLeadData.
 */
function parseWebsiteForm(webhookData: Record<string, unknown>): WebhookLeadData {
  const d = webhookData;

  const fullName = ((d.full_name as string) ?? (d.name as string) ?? '').split(' ');
  const firstName = fullName[0] || (d.first_name as string) || '';
  const lastName = fullName.slice(1).join(' ') || (d.last_name as string) || '';

  return {
    source: LEAD_SOURCES.WEBSITE,
    sourceId: d.form_id as string,
    firstName,
    lastName,
    email: d.email as string,
    phone: (d.phone as string) ?? (d.mobile as string) ?? '',
    altPhone: d.alt_phone as string,
    propertyType: d.property_type as string,
    propertyInterest: (d.interest as string) ?? (d.purpose as string),
    budget: d.budget ? Number(d.budget) : undefined,
    city: d.city as string,
    locality: d.locality as string,
    message: (d.message as string) ?? (d.comment as string),
    metadata: { raw_website_data: webhookData },
  };
}

// ─── Main Processor ─────────────────────────────────────────────────────────

const sourceParsers: Record<
  string,
  (data: Record<string, unknown>) => WebhookLeadData
> = {
  facebook: parseFacebookLead,
  google: parseGoogleLead,
  website: parseWebsiteForm,
};

/**
 * Parse incoming webhook data into a normalized WebhookLeadData object.
 *
 * @param source - Source identifier ('facebook', 'google', 'website', or custom)
 * @param data   - Raw webhook payload
 * @returns Parsed WebhookLeadData
 */
export function parseWebhookPayload(
  source: string,
  data: Record<string, unknown>,
): WebhookLeadData {
  const parser = sourceParsers[source.toLowerCase()];
  if (parser) {
    return parser(data);
  }

  // Generic fallback parser
  const fullName = ((data.full_name as string) ?? (data.name as string) ?? '').split(' ');
  return {
    source: (data.source as LeadSourceValue) ?? LEAD_SOURCES.OTHER,
    sourceId: data.lead_id as string ?? data.id as string,
    firstName: fullName[0] || (data.first_name as string) || '',
    lastName: fullName.slice(1).join(' ') || (data.last_name as string) || '',
    email: data.email as string,
    phone: (data.phone as string) ?? '',
    altPhone: data.alt_phone as string,
    propertyType: data.property_type as string,
    propertyInterest: data.interest as string ?? data.purpose as string,
    budget: data.budget ? Number(data.budget) : undefined,
    city: data.city as string,
    locality: data.locality as string,
    message: data.message as string ?? data.comment as string,
    metadata: { raw_data: data },
  };
}

/**
 * Process a webhook lead — parse, normalize, deduplicate, and create.
 *
 * @param source   - Source identifier
 * @param data     - Raw webhook data
 * @param tenantId - Tenant UUID to associate the lead with
 * @returns WebhookResult with the created lead or duplicate info
 */
export async function processWebhookLead(
  source: string,
  data: Record<string, unknown>,
  tenantId: string,
): Promise<WebhookResult> {
  const errors: string[] = [];

  try {
    // 1. Parse source-specific data
    const parsed = parseWebhookPayload(source, data);

    // 2. Normalize phone
    const normalizedPhone = normalizePhone(parsed.phone);
    if (!normalizedPhone) {
      errors.push('Phone number is required and could not be parsed');
      return { success: false, lead: null, duplicate: false, duplicateOf: null, errors };
    }

    // 3. Check for duplicates
    const existingLeadId = await detectDuplicate(normalizedPhone, tenantId);
    if (existingLeadId) {
      return {
        success: true,
        lead: null,
        duplicate: true,
        duplicateOf: existingLeadId,
        errors: ['Duplicate lead — found existing lead with same phone number'],
      };
    }

    // 4. Create the lead in the database
    const leadId = crypto.randomUUID();
    const now = new Date().toISOString();

    // In production:
    //   await supabase.from('leads').insert({
    //     id: leadId,
    //     tenant_id: tenantId,
    //     first_name: parsed.firstName,
    //     last_name: parsed.lastName,
    //     email: parsed.email ?? null,
    //     phone: normalizedPhone,
    //     alt_phone: parsed.altPhone ?? null,
    //     source: parsed.source,
    //     source_id: parsed.sourceId ?? null,
    //     property_type: parsed.propertyType ?? null,
    //     property_interest: parsed.propertyInterest ?? null,
    //     budget: parsed.budget ?? null,
    //     city: parsed.city ?? null,
    //     locality: parsed.locality ?? null,
    //     message: parsed.message ?? null,
    //     status: 'new',
    //     assigned_to: null,
    //     metadata: parsed.metadata,
    //     created_at: now,
    //     updated_at: now,
    //   });

    const lead: ProcessedLead = {
      id: leadId,
      tenantId,
      firstName: parsed.firstName,
      lastName: parsed.lastName,
      email: parsed.email ?? null,
      phone: normalizedPhone,
      altPhone: parsed.altPhone ?? null,
      source: parsed.source,
      sourceId: parsed.sourceId ?? null,
      propertyType: parsed.propertyType ?? null,
      propertyInterest: parsed.propertyInterest ?? null,
      budget: parsed.budget ?? null,
      city: parsed.city ?? null,
      locality: parsed.locality ?? null,
      message: parsed.message ?? null,
      status: 'new',
      assignedTo: null,
      metadata: parsed.metadata ?? null,
      duplicateOf: null,
      createdAt: now,
    };

    // Index for duplicate detection
    leadPhoneIndex.set(`${tenantId}:${normalizedPhone}`, leadId);

    return {
      success: true,
      lead,
      duplicate: false,
      duplicateOf: null,
      errors: [],
    };
  } catch (error) {
    console.error('[intakeWebhook] processWebhookLead error:', error);
    errors.push(
      `Processing error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
    return { success: false, lead: null, duplicate: false, duplicateOf: null, errors };
  }
}

/**
 * High-level webhook callback handler.
 *
 * Processes the incoming webhook data, creates a lead, and logs the event.
 *
 * @param source      - Source identifier
 * @param webhookData - Raw webhook payload
 * @param tenantId    - Tenant UUID
 * @returns WebhookResult
 */
export async function handleWebhookCallback(
  source: string,
  webhookData: Record<string, unknown>,
  tenantId: string,
): Promise<WebhookResult> {
  // 1. Process the lead
  const result = await processWebhookLead(source, webhookData, tenantId);

  // 2. Log the activity (in production, call activity logger)
  if (result.success && result.lead) {
    // await logActivity(tenantId, null, 'webhook_received', result.lead.id,
    //   `Lead received from ${source}: ${result.lead.firstName} ${result.lead.lastName}`);
    console.log(
      `[webhook] Lead ${result.duplicate ? 'duplicate' : 'created'} from ${source}:`,
      result.lead.id,
    );
  }

  return result;
}

export { leadPhoneIndex };
