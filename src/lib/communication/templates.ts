// ============================================================================
// EstateFlow CRM — Message Templates
// Phase 4 — Communication (AGENT-4-4-TEMPLATES-SHARING)
// ============================================================================
//
// Provides a template system for message content across WhatsApp, SMS, and
// email channels. Supports tenant-scoped custom templates, variables, and
// default system templates for common communication scenarios.
// ============================================================================

import { randomUUID } from 'crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TemplateChannel = 'whatsapp' | 'sms' | 'email';

export type TemplateCategory =
  | 'lead_confirmation'
  | 'site_visit_reminder'
  | 'follow_up'
  | 'deal_won'
  | 'deal_lost'
  | 'property_share'
  | 'custom';

export interface MessageTemplate {
  id: string;
  tenantId: string | null; // null = system default
  name: string;
  channel: TemplateChannel;
  category: TemplateCategory;
  content: string;
  variables: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTemplateInput {
  tenantId: string | null;
  name: string;
  channel: TemplateChannel;
  category: TemplateCategory;
  content: string;
  variables?: string[];
  isActive?: boolean;
}

export interface UpdateTemplateInput {
  name?: string;
  channel?: TemplateChannel;
  category?: TemplateCategory;
  content?: string;
  variables?: string[];
  isActive?: boolean;
}

// ---------------------------------------------------------------------------
// Default System Templates
// ---------------------------------------------------------------------------

const SYSTEM_TEMPLATES: MessageTemplate[] = [
  // ── Lead Confirmation ──────────────────────────────────────────────────
  {
    id: 'sys-lead-confirmation-whatsapp',
    tenantId: null,
    name: 'lead_confirmation',
    channel: 'whatsapp',
    category: 'lead_confirmation',
    content:
      'Thank you for your interest, {{name}}! 🎉\n\nWe have received your inquiry regarding {{propertyType}} in {{location}}. Our team will get back to you shortly.\n\nYour preference: {{budget}}\n\n_ EstateFlow CRM _',
    variables: ['name', 'propertyType', 'location', 'budget'],
    isActive: true,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'sys-lead-confirmation-sms',
    tenantId: null,
    name: 'lead_confirmation',
    channel: 'sms',
    category: 'lead_confirmation',
    content:
      'Hi {{name}}, thanks for your interest in {{propertyType}} at {{location}} (budget: {{budget}}). We will reach out soon. - EstateFlow',
    variables: ['name', 'propertyType', 'location', 'budget'],
    isActive: true,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'sys-lead-confirmation-email',
    tenantId: null,
    name: 'lead_confirmation',
    channel: 'email',
    category: 'lead_confirmation',
    content:
      'Subject: Thank you for your inquiry, {{name}}\n\nDear {{name}},\n\nThank you for reaching out to us regarding {{propertyType}} properties in {{location}}.\n\nWe have received your inquiry (budget: {{budget}}) and one of our agents will contact you shortly.\n\nBest regards,\nEstateFlow CRM Team',
    variables: ['name', 'propertyType', 'location', 'budget'],
    isActive: true,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },

  // ── Site Visit Reminder ────────────────────────────────────────────────
  {
    id: 'sys-site-visit-whatsapp',
    tenantId: null,
    name: 'site_visit_reminder',
    channel: 'whatsapp',
    category: 'site_visit_reminder',
    content:
      '🔔 Reminder: Site Visit Scheduled\n\nHi {{name}},\n\nThis is a reminder for your scheduled site visit:\n📍 Property: {{propertyTitle}}\n📅 Date & Time: {{dateTime}}\n📌 Location: {{location}}\n\n{{notes}}\n\nPlease be on time. Reply STOP to opt out.',
    variables: ['name', 'propertyTitle', 'dateTime', 'location', 'notes'],
    isActive: true,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'sys-site-visit-sms',
    tenantId: null,
    name: 'site_visit_reminder',
    channel: 'sms',
    category: 'site_visit_reminder',
    content:
      'REMINDER: Site visit for {{propertyTitle}} on {{dateTime}} at {{location}}. {{notes}} - EstateFlow CRM',
    variables: ['name', 'propertyTitle', 'dateTime', 'location', 'notes'],
    isActive: true,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },

  // ── Follow Up ──────────────────────────────────────────────────────────
  {
    id: 'sys-follow-up-whatsapp',
    tenantId: null,
    name: 'follow_up',
    channel: 'whatsapp',
    category: 'follow_up',
    content:
      'Hi {{name}}! 👋\n\nIt has been {{daysSinceContact}} days since we last spoke. Are you still looking for properties?\n\nWe have some new listings that might interest you. Feel free to reply or give us a call.\n\n_ EstateFlow CRM _',
    variables: ['name', 'daysSinceContact'],
    isActive: true,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'sys-follow-up-sms',
    tenantId: null,
    name: 'follow_up',
    channel: 'sms',
    category: 'follow_up',
    content:
      'Hi {{name}}, been {{daysSinceContact}} days. Still interested? Check new listings or reply to this message. - EstateFlow',
    variables: ['name', 'daysSinceContact'],
    isActive: true,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },

  // ── Deal Won ───────────────────────────────────────────────────────────
  {
    id: 'sys-deal-won-whatsapp',
    tenantId: null,
    name: 'deal_won',
    channel: 'whatsapp',
    category: 'deal_won',
    content:
      '🎉 Congratulations, {{name}}!\n\nWe are thrilled to inform you that the deal for {{propertyTitle}} at {{price}} has been finalized.\n\nWelcome to your new home! 🏡\n\nThank you for choosing us.\n_ EstateFlow CRM _',
    variables: ['name', 'propertyTitle', 'price'],
    isActive: true,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'sys-deal-won-sms',
    tenantId: null,
    name: 'deal_won',
    channel: 'sms',
    category: 'deal_won',
    content:
      'CONGRATS {{name}}! Deal closed for {{propertyTitle}} at {{price}}. Welcome home! 🎉 - EstateFlow CRM',
    variables: ['name', 'propertyTitle', 'price'],
    isActive: true,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },

  // ── Deal Lost ──────────────────────────────────────────────────────────
  {
    id: 'sys-deal-lost-whatsapp',
    tenantId: null,
    name: 'deal_lost',
    channel: 'whatsapp',
    category: 'deal_lost',
    content:
      'Hi {{name}},\n\nWe understand that {{propertyTitle}} did not work out for you this time. We appreciate the opportunity to assist you.\n\nIf your needs change or you would like to explore other options, we are always here to help.\n\nBest regards,\n_ EstateFlow CRM _',
    variables: ['name', 'propertyTitle'],
    isActive: true,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'sys-deal-lost-sms',
    tenantId: null,
    name: 'deal_lost',
    channel: 'sms',
    category: 'deal_lost',
    content:
      'Hi {{name}}, sorry {{propertyTitle}} did not work out. We have many other options — feel free to reach out anytime. - EstateFlow',
    variables: ['name', 'propertyTitle'],
    isActive: true,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },

  // ── Property Share ─────────────────────────────────────────────────────
  {
    id: 'sys-property-share-whatsapp',
    tenantId: null,
    name: 'property_share',
    channel: 'whatsapp',
    category: 'property_share',
    content:
      '🏡 {{title}}\n\n💰 Price: {{price}}\n🛏 Bedrooms: {{bedrooms}}\n📍 Location: {{location}}\n📐 Area: {{area}}\n\n{{url}}\n\nContact us for more details!',
    variables: ['title', 'price', 'bedrooms', 'location', 'area', 'url'],
    isActive: true,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'sys-property-share-sms',
    tenantId: null,
    name: 'property_share',
    channel: 'sms',
    category: 'property_share',
    content:
      'Check out {{title}} — {{price}}, {{bedrooms}}BHK, {{location}}. Details: {{url}} - EstateFlow',
    variables: ['title', 'price', 'bedrooms', 'location', 'url'],
    isActive: true,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
];

// ---------------------------------------------------------------------------
// In-Memory Template Store (MVP)
// ---------------------------------------------------------------------------

/**
 * In-memory store for template definitions.
 * In production, replace with a PostgreSQL table (message_templates).
 */
const templateStore: MessageTemplate[] = [...SYSTEM_TEMPLATES];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Get a template by name and channel, preferring tenant-specific over system.
 */
export function getTemplate(
  name: string,
  channel: TemplateChannel,
  tenantId?: string,
): MessageTemplate | null {
  // Prefer tenant-specific template
  if (tenantId) {
    const tenantTemplate = templateStore.find(
      (t) =>
        t.name === name &&
        t.channel === channel &&
        t.tenantId === tenantId &&
        t.isActive,
    );
    if (tenantTemplate) return tenantTemplate;
  }

  // Fall back to system default
  const systemTemplate = templateStore.find(
    (t) =>
      t.name === name &&
      t.channel === channel &&
      t.tenantId === null &&
      t.isActive,
  );

  return systemTemplate ?? null;
}

/**
 * Render a template by replacing {{variable}} placeholders with values.
 * Throws if a required variable is missing.
 */
export function renderTemplate(
  template: MessageTemplate,
  variables: Record<string, string>,
): string {
  let result = template.content;

  for (const variable of template.variables) {
    const value = variables[variable];
    if (value === undefined || value === null) {
      throw new Error(
        `Missing required variable "${variable}" for template "${template.name}"`,
      );
    }
    result = result.replace(new RegExp(`\\{\\{${variable}\\}\\}`, 'g'), value);
  }

  return result;
}

/**
 * List all templates for a tenant (including system defaults).
 */
export function getTenantTemplates(
  tenantId?: string,
  options?: {
    channel?: TemplateChannel;
    category?: TemplateCategory;
    activeOnly?: boolean;
  },
): MessageTemplate[] {
  let results = templateStore.filter(
    (t) => t.tenantId === null || t.tenantId === tenantId,
  );

  if (options?.channel) {
    results = results.filter((t) => t.channel === options.channel);
  }

  if (options?.category) {
    results = results.filter((t) => t.category === options.category);
  }

  if (options?.activeOnly !== false) {
    results = results.filter((t) => t.isActive);
  }

  return results;
}

/**
 * Create a new template.
 */
export function createTemplate(input: CreateTemplateInput): MessageTemplate {
  const now = new Date().toISOString();

  const template: MessageTemplate = {
    id: randomUUID(),
    tenantId: input.tenantId,
    name: input.name,
    channel: input.channel,
    category: input.category,
    content: input.content,
    variables: input.variables ?? extractVariables(input.content),
    isActive: input.isActive ?? true,
    createdAt: now,
    updatedAt: now,
  };

  templateStore.push(template);
  return template;
}

/**
 * Update an existing template.
 */
export function updateTemplate(
  id: string,
  input: UpdateTemplateInput,
): MessageTemplate | null {
  const index = templateStore.findIndex((t) => t.id === id);
  if (index === -1) return null;

  const existing = templateStore[index]!;
  const now = new Date().toISOString();

  const updated: MessageTemplate = {
    ...existing,
    name: input.name ?? existing.name,
    channel: input.channel ?? existing.channel,
    category: input.category ?? existing.category,
    content: input.content ?? existing.content,
    variables: input.variables ?? existing.variables,
    isActive: input.isActive ?? existing.isActive,
    updatedAt: now,
  };

  templateStore[index] = updated;
  return updated;
}

/**
 * Delete a template by ID.
 */
export function deleteTemplate(id: string): boolean {
  const index = templateStore.findIndex((t) => t.id === id);
  if (index === -1) return false;

  // Prevent deletion of system templates
  if (templateStore[index]!.tenantId === null) {
    return false;
  }

  templateStore.splice(index, 1);
  return true;
}

/**
 * Get a single template by ID.
 */
export function getTemplateById(id: string): MessageTemplate | null {
  return templateStore.find((t) => t.id === id) ?? null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract {{variable}} names from template content.
 */
function extractVariables(content: string): string[] {
  const regex = /\{\{(\w+)\}\}/g;
  const variables: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    if (!variables.includes(match[1]!)) {
      variables.push(match[1]!);
    }
  }

  return variables;
}

/**
 * Reset template store to defaults (useful for testing).
 */
export function resetTemplates(): void {
  templateStore.length = 0;
  templateStore.push(...SYSTEM_TEMPLATES);
}
