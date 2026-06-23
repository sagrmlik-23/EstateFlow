// ============================================================================
// EstateFlow CRM — AI Script Builder
// Phase 3 — AI Voice Agent
// ============================================================================
//
// Builds voice call scripts by replacing {{variable}} placeholders in
// templates. Provides specific builders for different call scenarios:
//   - First contact (new lead)
//   - Follow-up (N days after last contact)
//   - Site visit confirmation
//   - Post-visit follow-up
//   - Negotiation / offer
//   - Re-engagement (lost / stale leads)
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LeadVariables {
  leadName: string;
  leadPhone: string | null;
  leadEmail: string | null;
  leadSource: string | null;
  leadStatus: string | null;
  leadScore: number | null;
  budgetMin: string | null;
  budgetMax: string | null;
  preferredLocation: string | null;
  propertyType: string | null;
  notes: string | null;
  daysSinceCreated: number;
  daysSinceLastContact: number;
}

export interface AgentVariables {
  agentName: string;
  agentVoice: string | null;
  agentLanguage: string | null;
  agentPurpose: string | null;
}

export interface TenantVariables {
  tenantName: string;
  tenantLogoUrl: string | null;
  tenantWhatsappNumber: string | null;
  tenantEmailSender: string | null;
}

// ---------------------------------------------------------------------------
// Template variable resolution
// ---------------------------------------------------------------------------

/**
 * Build a script by replacing {{variable}} placeholders in a template string.
 * Unresolved variables are left as-is (visible to caller for debugging).
 */
export function buildScript(
  template: string,
  variables: Record<string, string | number | boolean | null | undefined>,
): string {
  let script = template;

  for (const [key, value] of Object.entries(variables)) {
    if (value === null || value === undefined) {
      // Leave unset variables as-is so caller can see what's missing
      continue;
    }
    const placeholder = new RegExp(`\\{\\{\\s*${escapeRegex(key)}\\s*\\}\\}`, 'g');
    script = script.replace(placeholder, String(value));
  }

  return script;
}

/**
 * Escape special regex characters for use in template variable names.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------------------------------------------------------------------------
// Variable extractors
// ---------------------------------------------------------------------------

/**
 * Extract all lead-related template variables from a lead record.
 */
export function getVariablesForLead(lead: {
  full_name: string;
  phone?: string | null;
  email?: string | null;
  source?: string | null;
  status?: string | null;
  ai_score?: number | null;
  budget_min?: number | null;
  budget_max?: number | null;
  preferred_location?: string | null;
  property_type?: string | null;
  notes?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}): LeadVariables {
  const now = Date.now();
  const createdDate = lead.created_at ? new Date(lead.created_at).getTime() : now;
  const updatedDate = lead.updated_at ? new Date(lead.updated_at).getTime() : now;

  return {
    leadName: lead.full_name,
    leadPhone: lead.phone ?? null,
    leadEmail: lead.email ?? null,
    leadSource: lead.source ?? null,
    leadStatus: lead.status ?? null,
    leadScore: lead.ai_score ?? null,
    budgetMin: lead.budget_min != null ? formatCurrency(lead.budget_min) : null,
    budgetMax: lead.budget_max != null ? formatCurrency(lead.budget_max) : null,
    preferredLocation: lead.preferred_location ?? null,
    propertyType: lead.property_type ?? null,
    notes: lead.notes ?? null,
    daysSinceCreated: Math.floor((now - createdDate) / 86_400_000),
    daysSinceLastContact: Math.floor((now - updatedDate) / 86_400_000),
  };
}

/**
 * Extract all agent-related template variables from an AI agent record.
 */
export function getVariablesForAgent(agent: {
  name: string;
  voice?: string | null;
  language?: string | null;
  purpose?: string | null;
}): AgentVariables {
  return {
    agentName: agent.name,
    agentVoice: agent.voice ?? null,
    agentLanguage: agent.language ?? 'en',
    agentPurpose: agent.purpose ?? null,
  };
}

/**
 * Extract all tenant-related template variables from a tenant record.
 */
export function getVariablesForTenant(tenant: {
  name: string;
  logo_url?: string | null;
  whatsapp_number?: string | null;
  email_sender_name?: string | null;
}): TenantVariables {
  return {
    tenantName: tenant.name,
    tenantLogoUrl: tenant.logo_url ?? null,
    tenantWhatsappNumber: tenant.whatsapp_number ?? null,
    tenantEmailSender: tenant.email_sender_name ?? null,
  };
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value);
}

// ============================================================================
// Scenario-specific script builders
// ============================================================================

/**
 * Default templates for each scenario.
 * These are used when no custom template is provided for the agent.
 */
const DEFAULT_TEMPLATES: Record<string, string> = {
  firstContact: `
Hello {{leadName}}! This is {{agentName}} from {{tenantName}}.

I see you recently showed interest in our properties{{#if preferredLocation}} in {{preferredLocation}}{{/if}}.

I'm calling to understand your requirements better. Are you looking for a {{propertyType}} within a budget of {{budgetMin}} to {{budgetMax}}?

I'd love to help you find the perfect property. Would you be interested in scheduling a site visit this weekend?
`,
  followUp: `
Hi {{leadName}}! This is {{agentName}} from {{tenantName}} again.

It's been {{daysSinceLastContact}} days since we last spoke, and I wanted to follow up on your interest in properties{{#if preferredLocation}} around {{preferredLocation}}{{/if}}.

Do you have any questions I can help answer? We also have some new listings that might interest you.
`,
  siteVisit: `
Hello {{leadName}}! This is {{agentName}} from {{tenantName}}.

I'm calling to confirm your scheduled site visit {{#if siteVisitTime}}at {{siteVisitTime}}{{/if}} {{#if siteVisitLocation}}to {{siteVisitLocation}}{{/if}}.

Please bring any necessary documents if you're serious about moving forward. Is everything still on schedule?

You can reach us at {{tenantWhatsappNumber}} if you need to reschedule.
`,
  postVisit: `
Hi {{leadName}}! {{agentName}} from {{tenantName}} here.

I hope you enjoyed your site visit. I wanted to hear your thoughts on the property you saw.

Do you have any questions, or would you like to discuss the next steps? We're here to help!
`,
  negotiation: `
Hello {{leadName}}! This is {{agentName}} from {{tenantName}}.

I've looked into the numbers and wanted to discuss the pricing for the property you're interested in{{#if preferredLocation}} at {{preferredLocation}}{{/if}}.

Your budget was around {{budgetMax}}, and I think we can find something that works well for you. Would you like to go over the details?
`,
  reEngagement: `
Hi {{leadName}}! This is {{agentName}} from {{tenantName}}.

It's been a while since we last connected — {{monthsSinceContact}} months, actually! I hope you're doing well.

I'm reaching out because we have some exciting new listings{{#if preferredLocation}} in {{preferredLocation}}{{/if}} that might be perfect for you.

Would you be open to a quick chat about the current market?
`,
};

// ---------------------------------------------------------------------------
// Builder 1: First Contact
// ---------------------------------------------------------------------------

export function buildFirstContactScript(
  lead: Parameters<typeof getVariablesForLead>[0],
  agent: Parameters<typeof getVariablesForAgent>[0],
  customTemplate?: string,
): string {
  const leadVars = getVariablesForLead(lead);
  const agentVars = getVariablesForAgent(agent);

  const template = customTemplate || DEFAULT_TEMPLATES.firstContact!;

  return buildScript(template, {
    ...leadVars,
    ...agentVars,
    // Flatten for template use
    leadName: leadVars.leadName,
    agentName: agentVars.agentName,
  });
}

// ---------------------------------------------------------------------------
// Builder 2: Follow-Up
// ---------------------------------------------------------------------------

export function buildFollowUpScript(
  lead: Parameters<typeof getVariablesForLead>[0],
  agent: Parameters<typeof getVariablesForAgent>[0],
  daysAgo: number = 3,
  customTemplate?: string,
): string {
  const leadVars = getVariablesForLead(lead);
  const agentVars = getVariablesForAgent(agent);

  const template = customTemplate || DEFAULT_TEMPLATES.followUp!;
  const daysSinceContact = daysAgo;

  return buildScript(template, {
    ...leadVars,
    ...agentVars,
    daysSinceLastContact: daysSinceContact,
    leadName: leadVars.leadName,
    agentName: agentVars.agentName,
  });
}

// ---------------------------------------------------------------------------
// Builder 3: Site Visit Confirmation
// ---------------------------------------------------------------------------

export function buildSiteVisitScript(
  lead: Parameters<typeof getVariablesForLead>[0],
  agent: Parameters<typeof getVariablesForAgent>[0],
  siteVisitTime?: string,
  siteVisitLocation?: string,
  customTemplate?: string,
): string {
  const leadVars = getVariablesForLead(lead);
  const agentVars = getVariablesForAgent(agent);

  const template = customTemplate || DEFAULT_TEMPLATES.siteVisit!;

  return buildScript(template, {
    ...leadVars,
    ...agentVars,
    siteVisitTime: siteVisitTime ?? null,
    siteVisitLocation: siteVisitLocation ?? null,
    leadName: leadVars.leadName,
    agentName: agentVars.agentName,
  });
}

// ---------------------------------------------------------------------------
// Builder 4: Post-Visit Follow-Up
// ---------------------------------------------------------------------------

export function buildPostVisitScript(
  lead: Parameters<typeof getVariablesForLead>[0],
  agent: Parameters<typeof getVariablesForAgent>[0],
  customTemplate?: string,
): string {
  const leadVars = getVariablesForLead(lead);
  const agentVars = getVariablesForAgent(agent);

  const template = customTemplate || DEFAULT_TEMPLATES.postVisit!;

  return buildScript(template, {
    ...leadVars,
    ...agentVars,
    leadName: leadVars.leadName,
    agentName: agentVars.agentName,
  });
}

// ---------------------------------------------------------------------------
// Builder 5: Negotiation
// ---------------------------------------------------------------------------

export function buildNegotiationScript(
  lead: Parameters<typeof getVariablesForLead>[0],
  agent: Parameters<typeof getVariablesForAgent>[0],
  customTemplate?: string,
): string {
  const leadVars = getVariablesForLead(lead);
  const agentVars = getVariablesForAgent(agent);

  const template = customTemplate || DEFAULT_TEMPLATES.negotiation!;

  return buildScript(template, {
    ...leadVars,
    ...agentVars,
    leadName: leadVars.leadName,
    agentName: agentVars.agentName,
  });
}

// ---------------------------------------------------------------------------
// Builder 6: Re-Engagement
// ---------------------------------------------------------------------------

export function buildReEngagementScript(
  lead: Parameters<typeof getVariablesForLead>[0],
  agent: Parameters<typeof getVariablesForAgent>[0],
  monthsAgo: number = 3,
  customTemplate?: string,
): string {
  const leadVars = getVariablesForLead(lead);
  const agentVars = getVariablesForAgent(agent);

  const template = customTemplate || DEFAULT_TEMPLATES.reEngagement!;

  return buildScript(template, {
    ...leadVars,
    ...agentVars,
    monthsSinceContact: monthsAgo,
    leadName: leadVars.leadName,
    agentName: agentVars.agentName,
  });
}
