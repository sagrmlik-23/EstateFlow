// ============================================================================
// EstateFlow CRM — One-Click Property Share
// Phase 4 — Communication (AGENT-4-4-TEMPLATES-SHARING)
// ============================================================================
//
// Generates share links and formatted messages for sharing property details
// via WhatsApp, SMS, and email channels. Supports one-click sharing with
// formatted messages including price (₹), bedrooms, and location.
// ============================================================================

import { renderTemplate, getTemplate } from './templates';
import type { TemplateChannel } from './templates';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PropertyShareLead {
  id: string;
  fullName: string;
  phone?: string;
  email?: string;
}

export interface PropertyShareDetail {
  id: string;
  title: string;
  price: number;
  bedrooms: number;
  bathrooms?: number;
  area?: number;
  areaUnit?: string;
  location: string;
  address?: string;
  propertyType?: string;
  imageUrl?: string;
  description?: string;
}

export interface SharedPropertyResult {
  success: boolean;
  channel: TemplateChannel;
  messageId?: string;
  shareUrl?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Share Link Generation
// ---------------------------------------------------------------------------

/**
 * Base URL for property links — configurable via env or fallback.
 */
function getBaseUrl(): string {
  return process.env.NEXT_PUBLIC_BASE_URL ?? process.env.BASE_URL ?? 'https://app.estateflowcrm.com';
}

/**
 * Generate a short share link to a property.
 *
 * In production, this could use a URL shortener (e.g., TinyURL, Rebrandly).
 * For now, returns a direct property URL.
 */
export function generateShareLink(
  propertyId: string,
  _tenantId: string,
): string {
  const baseUrl = getBaseUrl();
  const slug = propertyId.replace(/-/g, '').slice(0, 8);
  return `${baseUrl}/property/${slug}?ref=share_${_tenantId.slice(0, 8)}`;
}

// ---------------------------------------------------------------------------
// Formatted Property Message
// ---------------------------------------------------------------------------

/**
 * Format price in Indian Rupee format (₹).
 */
export function formatPrice(price: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(price);
}

/**
 * Format area with unit.
 */
function formatArea(area?: number, unit?: string): string {
  if (!area) return 'N/A';
  return `${area} ${unit ?? 'sq.ft.'}`;
}

/**
 * Generate a formatted property message string (text-based).
 * Used for WhatsApp and SMS sharing.
 */
export function shareMessage(property: PropertyShareDetail, includeUrl?: string): string {
  const formattedPrice = formatPrice(property.price);
  const bedroomText = property.bedrooms > 0
    ? `${property.bedrooms} ${property.bedrooms === 1 ? 'Bedroom' : 'Bedrooms'}`
    : 'Studio';

  const lines: string[] = [
    `🏡 ${property.title}`,
    `💰 ${formattedPrice}`,
    `🛏 ${bedroomText}`,
    `📍 ${property.location}`,
  ];

  if (property.area) {
    lines.push(`📐 ${formatArea(property.area, property.areaUnit)}`);
  }

  if (property.propertyType) {
    lines.push(`🏷 ${property.propertyType}`);
  }

  if (includeUrl) {
    lines.push('');
    lines.push(includeUrl);
  }

  lines.push('');
  lines.push('Contact us for more details!');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// WhatsApp Share
// ---------------------------------------------------------------------------

/**
 * Share a property via WhatsApp.
 *
 * Generates a wa.me link with the pre-formatted message. The lead can click
 * to open WhatsApp directly.
 */
export function shareViaWhatsApp(
  lead: PropertyShareLead,
  property: PropertyShareDetail,
): SharedPropertyResult {
  const phone = lead.phone;
  if (!phone) {
    return {
      success: false,
      channel: 'whatsapp',
      error: 'Lead has no phone number',
    };
  }

  try {
    const shareUrl = generateShareLink(property.id, '');
    const template = getTemplate('property_share', 'whatsapp');

    let message: string;

    if (template) {
      message = renderTemplate(template, {
        title: property.title,
        price: formatPrice(property.price),
        bedrooms: property.bedrooms.toString(),
        location: property.location,
        area: formatArea(property.area, property.areaUnit),
        url: shareUrl,
      });
    } else {
      message = shareMessage(property, shareUrl);
    }

    // Encode for URL
    const encodedMessage = encodeURIComponent(message);

    // Clean phone number: remove non-digits, strip leading 0 or +91
    const cleanPhone = phone.replace(/[^\d]/g, '').replace(/^(0|91)/, '');
    const waUrl = `https://wa.me/91${cleanPhone}?text=${encodedMessage}`;

    return {
      success: true,
      channel: 'whatsapp',
      shareUrl: waUrl,
      messageId: `whatsapp-share-${Date.now()}`,
    };
  } catch (error) {
    return {
      success: false,
      channel: 'whatsapp',
      error: error instanceof Error ? error.message : 'Unknown WhatsApp share error',
    };
  }
}

// ---------------------------------------------------------------------------
// Email Share
// ---------------------------------------------------------------------------

/**
 * Share a property via Email.
 *
 * Returns the mailto: link with subject and body pre-populated.
 */
export function shareViaEmail(
  lead: PropertyShareLead,
  property: PropertyShareDetail,
): SharedPropertyResult {
  const email = lead.email;
  if (!email) {
    return {
      success: false,
      channel: 'email',
      error: 'Lead has no email address',
    };
  }

  try {
    const shareUrl = generateShareLink(property.id, '');
    const formattedPrice = formatPrice(property.price);

    const subject = encodeURIComponent(`Property: ${property.title}`);

    const bodyLines: string[] = [
      `Hi ${lead.fullName},`,
      '',
      `I would like to share this property with you:`,
      '',
      `---`,
      `${property.title}`,
      `Price: ${formattedPrice}`,
      `Bedrooms: ${property.bedrooms}`,
      `Location: ${property.location}`,
    ];

    if (property.area) {
      bodyLines.push(`Area: ${formatArea(property.area, property.areaUnit)}`);
    }

    if (property.description) {
      bodyLines.push('');
      bodyLines.push(property.description);
    }

    bodyLines.push('');
    bodyLines.push(`View details: ${shareUrl}`);
    bodyLines.push('');
    bodyLines.push('Best regards');

    const body = encodeURIComponent(bodyLines.join('\n'));
    const mailtoUrl = `mailto:${email}?subject=${subject}&body=${body}`;

    return {
      success: true,
      channel: 'email',
      shareUrl: mailtoUrl,
      messageId: `email-share-${Date.now()}`,
    };
  } catch (error) {
    return {
      success: false,
      channel: 'email',
      error: error instanceof Error ? error.message : 'Unknown email share error',
    };
  }
}

// ---------------------------------------------------------------------------
// SMS Share
// ---------------------------------------------------------------------------

/**
 * Share a property via SMS.
 *
 * Returns the sms: link with a short message containing a link to the property.
 */
export function shareViaSMS(
  lead: PropertyShareLead,
  property: PropertyShareDetail,
): SharedPropertyResult {
  const phone = lead.phone;
  if (!phone) {
    return {
      success: false,
      channel: 'sms',
      error: 'Lead has no phone number',
    };
  }

  try {
    const shareUrl = generateShareLink(property.id, '');
    const template = getTemplate('property_share', 'sms');

    let message: string;

    if (template) {
      message = renderTemplate(template, {
        title: property.title,
        price: formatPrice(property.price),
        bedrooms: property.bedrooms.toString(),
        location: property.location,
        url: shareUrl,
      });
    } else {
      message = `Check out ${property.title} - ${formatPrice(property.price)}, ${property.bedrooms}BHK, ${property.location}. Details: ${shareUrl}`;
    }

    const encodedMessage = encodeURIComponent(message);
    const cleanPhone = phone.replace(/[^\d]/g, '');

    // Strip leading 0 or +91 for tel: links
    const telPhone = cleanPhone.replace(/^(0|91)/, '');
    const smsUrl = `sms:+91${telPhone}?body=${encodedMessage}`;

    return {
      success: true,
      channel: 'sms',
      shareUrl: smsUrl,
      messageId: `sms-share-${Date.now()}`,
    };
  } catch (error) {
    return {
      success: false,
      channel: 'sms',
      error: error instanceof Error ? error.message : 'Unknown SMS share error',
    };
  }
}

// ---------------------------------------------------------------------------
// Unified Share
// ---------------------------------------------------------------------------

/**
 * Share a property via the specified channel.
 * Returns a share URL or error.
 */
export function shareProperty(
  lead: PropertyShareLead,
  property: PropertyShareDetail,
  channel: TemplateChannel,
): SharedPropertyResult {
  switch (channel) {
    case 'whatsapp':
      return shareViaWhatsApp(lead, property);
    case 'email':
      return shareViaEmail(lead, property);
    case 'sms':
      return shareViaSMS(lead, property);
    default: {
      // Exhaustiveness check
      const _exhaustive: never = channel;
      return {
        success: false,
        channel: _exhaustive as TemplateChannel,
        error: `Unsupported channel: ${channel}`,
      };
    }
  }
}
