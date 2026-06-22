// ============================================================================
// EstateFlow CRM — Share Property API
// POST /api/communication/share/property — Share property via selected channel
// Phase 4 — Communication (AGENT-4-4-TEMPLATES-SHARING)
// ============================================================================
//
// Shares a property with a lead via the requested channel (WhatsApp, SMS,
// or Email). Returns a share URL that can be opened by the agent to send
// the property details to the lead.
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  shareViaWhatsApp,
  shareViaEmail,
  shareViaSMS,
  generateShareLink,
  formatPrice,
} from '@/lib/communication/propertyShare';
import type { PropertyShareLead, PropertyShareDetail } from '@/lib/communication/propertyShare';
import { withRateLimit } from '@/lib/security/rateLimiter';
import { auditLog } from '@/lib/security/auditLogger';
import type { UserRole } from '@/types/auth';

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const ALLOWED_CHANNELS = ['whatsapp', 'sms', 'email'] as const;

const sharePropertySchema = z.object({
  // Lead information
  lead: z.object({
    id: z.string().min(1, 'Lead ID is required'),
    fullName: z.string().min(1, 'Lead name is required'),
    phone: z.string().optional(),
    email: z.string().email().optional().or(z.literal('')),
  }),
  // Property information
  property: z.object({
    id: z.string().min(1, 'Property ID is required'),
    title: z.string().min(1, 'Property title is required'),
    price: z.number().positive('Price must be a positive number'),
    bedrooms: z.number().int().min(0),
    bathrooms: z.number().int().min(0).optional(),
    area: z.number().positive().optional(),
    areaUnit: z.string().optional(),
    location: z.string().min(1, 'Location is required'),
    address: z.string().optional(),
    propertyType: z.string().optional(),
    imageUrl: z.string().url().optional().or(z.literal('')),
    description: z.string().optional(),
  }),
  // Channel preference
  channel: z.enum(ALLOWED_CHANNELS),
  // Optional share link override (auto-generated if not provided)
  shareUrl: z.string().url().optional(),
});

export type SharePropertyBody = z.infer<typeof sharePropertySchema>;

// ---------------------------------------------------------------------------
// POST /api/communication/share/property
// ---------------------------------------------------------------------------

/**
 * POST /api/communication/share/property
 *
 * Shares a property with a lead via the requested channel.
 * Returns a share URL that the agent can use to send the property details.
 *
 * Body: { lead: { id, fullName, phone?, email? },
 *         property: { id, title, price, bedrooms, location, ... },
 *         channel: 'whatsapp' | 'sms' | 'email',
 *         shareUrl?: string }
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // ── Auth ──────────────────────────────────────────────────────────────
    const userId = request.headers.get('x-user-id');
    const tenantId = request.headers.get('x-tenant-id');
    const userRole = request.headers.get('x-user-role') as UserRole | null;
    const requestId = request.headers.get('x-session-id') || crypto.randomUUID();

    if (!userId || !tenantId) {
      return NextResponse.json(
        { success: false, data: null, error: 'Unauthorized — missing auth headers', meta: null },
        { status: 401 },
      );
    }

    // ── Rate limit ─────────────────────────────────────────────────────────
    const { result: rateResult, headers: rateHeaders } = await withRateLimit(
      request,
      'user',
      userId,
    );
    if (!rateResult.allowed) {
      return NextResponse.json(
        { success: false, data: null, error: 'Too many requests', meta: null },
        { status: 429, headers: rateHeaders },
      );
    }

    // ── Parse & validate ──────────────────────────────────────────────────
    const body = await request.json();
    const parsed = sharePropertySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          data: null,
          error: parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; '),
          meta: null,
        },
        { status: 400 },
      );
    }

    // ── Validate channel requirements ─────────────────────────────────────
    const { lead, property, channel, shareUrl } = parsed.data;

    if (channel === 'whatsapp' && !lead.phone) {
      return NextResponse.json(
        { success: false, data: null, error: 'Phone number is required for WhatsApp sharing', meta: null },
        { status: 400 },
      );
    }

    if (channel === 'sms' && !lead.phone) {
      return NextResponse.json(
        { success: false, data: null, error: 'Phone number is required for SMS sharing', meta: null },
        { status: 400 },
      );
    }

    if (channel === 'email' && !lead.email) {
      return NextResponse.json(
        { success: false, data: null, error: 'Email address is required for email sharing', meta: null },
        { status: 400 },
      );
    }

    // ── Build lead & property objects ─────────────────────────────────────
    const shareLead: PropertyShareLead = {
      id: lead.id,
      fullName: lead.fullName,
      phone: lead.phone,
      email: lead.email,
    };

    const sharePropertyData: PropertyShareDetail = {
      id: property.id,
      title: property.title,
      price: property.price,
      bedrooms: property.bedrooms,
      bathrooms: property.bathrooms,
      area: property.area,
      areaUnit: property.areaUnit,
      location: property.location,
      address: property.address,
      propertyType: property.propertyType,
      imageUrl: property.imageUrl,
      description: property.description,
    };

    // ── Generate share link if not provided ───────────────────────────────
    const resolvedShareUrl = shareUrl ?? generateShareLink(property.id, tenantId);

    // ── Share via selected channel ────────────────────────────────────────
    let result;

    switch (channel) {
      case 'whatsapp': {
        // For WhatsApp, we inject the share URL into the lead data
        result = shareViaWhatsApp(
          { ...shareLead, phone: lead.phone! },
          { ...sharePropertyData },
        );
        break;
      }
      case 'email': {
        result = shareViaEmail(
          { ...shareLead, email: lead.email! },
          { ...sharePropertyData },
        );
        break;
      }
      case 'sms': {
        result = shareViaSMS(
          { ...shareLead, phone: lead.phone! },
          { ...sharePropertyData },
        );
        break;
      }
      default: {
        return NextResponse.json(
          { success: false, data: null, error: `Unsupported channel: ${channel}`, meta: null },
          { status: 400 },
        );
      }
    }

    // ── Audit log ─────────────────────────────────────────────────────────
    await auditLog({
      tenantId,
      userId,
      action: 'share',
      entityType: 'property_share',
      entityId: `${channel}-${property.id}-${lead.id}`,
      oldValues: null,
      newValues: {
        leadId: lead.id,
        propertyId: property.id,
        propertyTitle: property.title,
        channel,
        price: formatPrice(property.price),
        shareUrl: resolvedShareUrl,
      },
      ipAddress: request.headers.get('x-forwarded-for') ?? null,
      userAgent: request.headers.get('user-agent') ?? null,
      requestId,
    }).catch(() => {});

    const statusCode = result.success ? 200 : 400;

    return NextResponse.json(
      {
        success: result.success,
        data: result.success
          ? {
              channel: result.channel,
              shareUrl: result.shareUrl,
              messageId: result.messageId,
              propertyTitle: property.title,
              price: formatPrice(property.price),
            }
          : null,
        error: result.error ?? null,
        meta: null,
      },
      {
        status: statusCode,
        headers: { ...rateHeaders, 'X-Request-Id': requestId },
      },
    );
  } catch (error) {
    console.error('[api/communication/share/property] POST error:', error);
    return NextResponse.json(
      { success: false, data: null, error: 'Internal server error', meta: null },
      { status: 500 },
    );
  }
}
