// ============================================================================
// EstateFlow CRM — Tenant Branding Public API Route
// GET /api/tenants/[slug]/branding
// Agent-5-Whitelabel Contract v1.0.0
// ============================================================================

import { NextResponse, type NextRequest } from 'next/server';
import type { WhiteLabelConfig } from '@/types/whitelabel';
import { generateDefaultBranding } from '@/lib/whitelabel/config';

// ─── GET handler ────────────────────────────────────────────────────────────

/**
 * GET /api/tenants/[slug]/branding
 *
 * Public endpoint that returns the tenant's white-label branding config.
 * No authentication required — this is intentionally public for SEO bots,
 * Twitter cards, Open Graph previews, and public pages.
 *
 * Path params:
 *   slug - The tenant's unique slug (e.g., "acme-realty")
 *
 * Response: { success: true, data: WhiteLabelConfig }
 *
 * When the tenant slug is "default" or unrecognised, returns the EstateFlow
 * default branding config.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  try {
    const { slug } = await params;

    if (!slug || typeof slug !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Missing tenant slug' },
        { status: 400 },
      );
    }

    const sanitizedSlug = slug.toLowerCase().trim();

    // For the MVP, return default branding for all slugs.
    // In production, this would query the tenants table:
    //
    //   const tenant = await prisma.tenants.findUnique({
    //     where: { slug: sanitizedSlug },
    //     select: {
    //       id: true,
    //       name: true,
    //       logo_url: true,
    //       favicon_url: true,
    //       primary_color: true,
    //       secondary_color: true,
    //       accent_color: true,
    //       custom_domain: true,
    //       email_sender_name: true,
    //       email_reply_to: true,
    //       whatsapp_number: true,
    //       sms_sender_id: true,
    //       is_white_label: true,
    //     },
    //   });
    //
    //   if (!tenant) {
    //     return NextResponse.json(
    //       { success: false, error: 'Tenant not found' },
    //       { status: 404 },
    //     );
    //   }
    //
    //   const config: WhiteLabelConfig = {
    //     tenant_id: tenant.id,
    //     company_name: tenant.name,
    //     logo_url: tenant.logo_url,
    //     favicon_url: tenant.favicon_url,
    //     primary_color: tenant.primary_color,
    //     secondary_color: tenant.secondary_color,
    //     accent_color: tenant.accent_color,
    //     custom_domain: tenant.custom_domain,
    //     email_sender_name: tenant.email_sender_name,
    //     email_reply_to: tenant.email_reply_to,
    //     whatsapp_number: tenant.whatsapp_number,
    //     sms_sender_id: tenant.sms_sender_id,
    //     is_white_label: tenant.is_white_label ?? false,
    //   };

    // For now, return default branding with the tenant slug as company_name
    // to demonstrate the system works end-to-end.
    const defaultConfig = generateDefaultBranding();
    const config: WhiteLabelConfig = {
      ...defaultConfig,
      tenant_id: sanitizedSlug,
      company_name: sanitizedSlug
        .split('-')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' '),
    };

    return NextResponse.json(
      { success: true, data: config },
      {
        status: 200,
        headers: {
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
          'Access-Control-Allow-Origin': '*',
        },
      },
    );
  } catch (error) {
    console.error('[branding] GET error:', error);

    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
