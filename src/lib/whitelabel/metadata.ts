// ============================================================================
// EstateFlow CRM — Tenant Metadata Generator
// Agent-5-Whitelabel Contract v1.0.0
// ============================================================================

import type { Metadata } from 'next';
import type { WhiteLabelConfig, GenerateMetadataOptions } from '@/types/whitelabel';

/**
 * Generates a Next.js Metadata object with tenant-specific SEO values.
 *
 * Use this in `generateMetadata()` exports of tenant-scoped pages to
 * dynamically set the page title, description, Open Graph image,
 * favicon, theme-color, and Twitter card based on the tenant's branding.
 *
 * @param config   - The WhiteLabelConfig for the current tenant
 * @param pageMeta - Optional page-specific overrides (title, description, path)
 * @returns Next.js Metadata object
 */
export function generateTenantMetadata(
  config: WhiteLabelConfig,
  pageMeta?: GenerateMetadataOptions,
): Metadata {
  const tenantName = config.company_name;
  const defaultTitle = 'EstateFlow CRM';
  const defaultDescription = 'White-Label Multi-Tenant SaaS CRM with AI Voice Agents';

  // Build title: page-specific or default, with tenant suffix
  const title = pageMeta?.title
    ? `${pageMeta.title} | ${tenantName}`
    : {
        default: tenantName,
        template: `%s | ${tenantName}`,
      };

  const description = pageMeta?.description ?? defaultDescription;

  // Favicon and icons
  const icons: Metadata['icons'] = {};
  if (config.favicon_url) {
    icons.icon = [
      { url: config.favicon_url, sizes: 'any', type: 'image/x-icon' },
    ];
    icons.apple = [{ url: config.favicon_url, sizes: '180x180' }];
  } else {
    icons.icon = '/favicon.ico';
  }

  // Open Graph image
  const openGraph: Metadata['openGraph'] = {
    title: pageMeta?.title ? `${pageMeta.title} | ${tenantName}` : tenantName,
    description,
    siteName: tenantName,
    type: 'website',
  };

  if (config.logo_url) {
    openGraph.images = [
      {
        url: config.logo_url,
        width: 1200,
        height: 630,
        alt: `${tenantName} logo`,
      },
    ];
  }

  // Twitter card
  const twitter: Metadata['twitter'] = {
    card: 'summary_large_image',
    title: pageMeta?.title ? `${pageMeta.title} | ${tenantName}` : tenantName,
    description,
  };

  if (config.logo_url) {
    twitter.images = [config.logo_url];
  }

  // Theme color
  const themeColor = config.primary_color ?? '#1e40af';

  // Other metadata
  const other: Record<string, string> = {
    'x-tenant-slug': config.tenant_id,
  };

  return {
    title,
    description,
    icons,
    openGraph,
    twitter,
    themeColor,
    other,
  };
}

/**
 * Generates minimal metadata for preloading favicon to avoid flash.
 *
 * Use this in the root layout's `generateMetadata()` to preload the
 * tenant's favicon before the client-side TenantFavicon component
 * can dynamically swap it.
 *
 * @param config - WhiteLabelConfig with favicon_url
 * @returns Partial Metadata with preconnect and prefetch hints
 */
export function generateFaviconPreloadMetadata(
  config: WhiteLabelConfig,
): Metadata {
  if (!config.favicon_url) return {};

  return {
    icons: {
      icon: [
        { url: config.favicon_url, sizes: 'any', type: 'image/x-icon' },
      ],
      apple: [{ url: config.favicon_url, sizes: '180x180' }],
    },
  };
}
