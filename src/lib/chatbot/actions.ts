// ============================================================================
// EstateFlow CRM — Chatbot Actions
// Phase 5 — AI Chatbot (AGENT-5-1-CHATBOT-ENGINE)
// ============================================================================
//
// Action handlers for the chatbot engine. These are triggered by the
// response generator when the bot needs to perform operations like
// searching properties, scheduling visits, or creating leads.
// ============================================================================

import type { ChatContext } from '@/types/chatbot';

// ============================================================================
// Mock Property Database (MVP — replace with Supabase query in production)
// ============================================================================

interface PropertyRecord {
  id: string;
  title: string;
  price: number;
  location: string;
  bedrooms: number;
  propertyType: string;
  area?: number;
  status: string;
  imageUrl?: string;
  description?: string;
}

const MOCK_PROPERTIES: PropertyRecord[] = [
  {
    id: 'prop-001',
    title: 'Luxury 2BHK Apartment in Wakad',
    price: 6500000,
    location: 'Wakad, Pune',
    bedrooms: 2,
    propertyType: 'Apartment',
    area: 1200,
    status: 'available',
    imageUrl: '/properties/apartment1.jpg',
    description: 'Spacious 2BHK apartment with modern amenities in prime Wakad location.',
  },
  {
    id: 'prop-002',
    title: '3BHK Independent Villa in Whitefield',
    price: 18500000,
    location: 'Whitefield, Bangalore',
    bedrooms: 3,
    propertyType: 'Villa',
    area: 2200,
    status: 'available',
    imageUrl: '/properties/villa1.jpg',
    description: 'Beautiful 3BHK villa with garden and parking in sought-after Whitefield.',
  },
  {
    id: 'prop-003',
    title: '1BHK Flat for Sale in Andheri West',
    price: 4500000,
    location: 'Andheri West, Mumbai',
    bedrooms: 1,
    propertyType: 'Flat',
    area: 550,
    status: 'available',
    imageUrl: '/properties/flat1.jpg',
    description: 'Affordable 1BHK flat in Andheri West, close to metro and amenities.',
  },
  {
    id: 'prop-004',
    title: '4BHK Penthouse in Golf Course Road',
    price: 32000000,
    location: 'Golf Course Road, Gurgaon',
    bedrooms: 4,
    propertyType: 'Penthouse',
    area: 3500,
    status: 'available',
    imageUrl: '/properties/penthouse1.jpg',
    description: 'Stunning 4BHK penthouse with panoramic views in Gurgaon.',
  },
  {
    id: 'prop-005',
    title: '2BHK Flat in HSR Layout',
    price: 8500000,
    location: 'HSR Layout, Bangalore',
    bedrooms: 2,
    propertyType: 'Flat',
    area: 1000,
    status: 'available',
  },
  {
    id: 'prop-006',
    title: 'Plot for Construction in Hinjewadi',
    price: 3000000,
    location: 'Hinjewadi Phase 3, Pune',
    bedrooms: 0,
    propertyType: 'Plot',
    area: 1500,
    status: 'available',
    description: 'Prime plot for construction in fast-developing Hinjewadi area.',
  },
  {
    id: 'prop-007',
    title: '3BHK Apartment in Noida Sector 62',
    price: 9500000,
    location: 'Sector 62, Noida',
    bedrooms: 3,
    propertyType: 'Apartment',
    area: 1450,
    status: 'available',
    imageUrl: '/properties/apartment2.jpg',
  },
  {
    id: 'prop-008',
    title: 'Luxury 2BHK in Bandra Kurla Complex',
    price: 25000000,
    location: 'BKC, Mumbai',
    bedrooms: 2,
    propertyType: 'Apartment',
    area: 1800,
    status: 'available',
    description: 'Premium 2BHK in the heart of Mumbai\u2019s commercial district.',
  },
];

// ============================================================================
// searchProperties — Search properties matching user criteria
// ============================================================================

/**
 * Search for properties matching the given criteria.
 * Supports filtering by location, budget, bedrooms, and property type.
 *
 * @param criteria - Search criteria from NLU entities and context
 * @returns Array of matching property records
 */
export async function searchProperties(
  criteria: Record<string, unknown>,
): Promise<PropertyRecord[]> {
  const location = (criteria.location as string)?.toLowerCase() ?? '';
  const budgetMin = (criteria.budgetMin as number) ?? 0;
  const budgetMax = (criteria.budgetMax as number) ?? Infinity;
  const bedrooms = criteria.bedrooms as number | undefined;
  const propertyType = (criteria.propertyType as string)?.toLowerCase() ?? '';

  let results = [...MOCK_PROPERTIES];

  // Filter by location
  if (location) {
    results = results.filter((p) => p.location.toLowerCase().includes(location));
  }

  // Filter by budget
  if (budgetMax < Infinity) {
    results = results.filter((p) => p.price <= budgetMax);
  }
  if (budgetMin > 0) {
    results = results.filter((p) => p.price >= budgetMin);
  }

  // Filter by bedrooms
  if (bedrooms !== undefined && bedrooms > 0) {
    results = results.filter((p) => p.bedrooms === bedrooms);
  }

  // Filter by property type
  if (propertyType) {
    const typeMap: Record<string, string[]> = {
      flat: ['flat', 'apartment'],
      apartment: ['flat', 'apartment'],
      villa: ['villa', 'banglow', 'bungalow'],
      house: ['villa', 'banglow', 'bungalow', 'penthouse'],
      plot: ['plot'],
      penthouse: ['penthouse'],
    };

    const matchingTypes = typeMap[propertyType] ?? [propertyType];
    results = results.filter((p) =>
      matchingTypes.some((t) => p.propertyType.toLowerCase().includes(t)),
    );
  }

  console.log(`[actions] searchProperties: found ${results.length} results`, criteria);
  return results;
}

// ============================================================================
// scheduleVisit — Schedule a site visit
// ============================================================================

interface VisitResult {
  success: boolean;
  visitId?: string;
  date?: string;
  time?: string;
  error?: string;
}

/**
 * Schedule a site visit for a lead to a property.
 *
 * @param leadId - Lead UUID
 * @param propertyId - Property UUID
 * @param date - Preferred date
 * @param time - Preferred time
 * @returns Visit scheduling result
 */
export async function scheduleVisit(
  leadId: string,
  propertyId: string,
  date: string,
  time: string,
): Promise<VisitResult | null> {
  if (!leadId) {
    console.warn('[actions] scheduleVisit: no leadId provided');
    return null;
  }

  try {
    // In production, this would create a record in the appointments/visits table
    const visit: VisitResult = {
      success: true,
      visitId: `visit-${crypto.randomUUID().slice(0, 8)}`,
      date,
      time,
    };

    console.log(`[actions] scheduleVisit: scheduled visit for lead ${leadId} on ${date} at ${time}`);
    return visit;
  } catch (error) {
    console.error('[actions] scheduleVisit failed:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// ============================================================================
// sendPropertyDetails — Send property details to a lead
// ============================================================================

/**
 * Send detailed property information to a lead via their preferred channel.
 *
 * @param leadId - Lead UUID
 * @param propertyId - Property UUID
 * @returns True if sent successfully
 */
export async function sendPropertyDetails(
  leadId: string,
  propertyId: string,
): Promise<boolean> {
  try {
    console.log(`[actions] sendPropertyDetails: sending property ${propertyId} to lead ${leadId}`);
    // In production, this would:
    // 1. Fetch lead's preferred contact channel (WhatsApp/Email/SMS)
    // 2. Generate formatted property message
    // 3. Send via the appropriate provider
    return true;
  } catch (error) {
    console.error('[actions] sendPropertyDetails failed:', error);
    return false;
  }
}

// ============================================================================
// connectToAgent — Create handoff task for human agent
// ============================================================================

/**
 * Request a human agent handoff for a lead.
 * Creates a task/notification for the support team.
 *
 * @param leadId - Lead UUID or session ID
 * @param reason - Reason for handoff
 * @returns True if handoff was requested successfully
 */
export async function connectToAgent(
  leadId: string,
  reason: string,
): Promise<boolean> {
  try {
    console.log(`[actions] connectToAgent: handoff requested for ${leadId}, reason: "${reason}"`);
    // In production, this would:
    // 1. Create a handoff record in the database
    // 2. Notify available agents (WebSocket/push/email)
    // 3. Update the session status
    return true;
  } catch (error) {
    console.error('[actions] connectToAgent failed:', error);
    return false;
  }
}

// ============================================================================
// createLeadFromChat — Create a lead in CRM from chat context
// ============================================================================

/**
 * Create a new lead record from accumulated chat conversation data.
 *
 * @param context - Current conversation context with extracted info
 * @returns Lead UUID if created, null otherwise
 */
export async function createLeadFromChat(context: ChatContext): Promise<string | null> {
  if (!context.name && !context.phone) {
    console.warn('[actions] createLeadFromChat: missing required fields (name or phone)');
    return null;
  }

  try {
    const leadId = `lead-chat-${crypto.randomUUID().slice(0, 8)}`;

    console.log('[actions] createLeadFromChat: lead created', {
      id: leadId,
      name: context.name,
      phone: context.phone,
      location: context.location,
      bedrooms: context.bedrooms,
    });

    // In production, this would insert into the leads table
    return leadId;
  } catch (error) {
    console.error('[actions] createLeadFromChat failed:', error);
    return null;
  }
}
