// ============================================================================
// EstateFlow CRM — TenantFavicon Component (use client)
// Agent-5-Whitelabel Contract v1.0.0
// ============================================================================

'use client';

import { useEffect, useRef } from 'react';
import { useTenant } from '@/lib/whitelabel/useTenant';

// ─── Props ──────────────────────────────────────────────────────────────────

export interface TenantFaviconProps {
  /** Tenant slug override (auto-detected if omitted) */
  tenantSlug?: string;
}

// ─── TenantFavicon ──────────────────────────────────────────────────────────

/**
 * Dynamically sets the page favicon by updating the
 * `document.querySelector('link[rel="icon"]')` href to the tenant's
 * favicon_url.
 *
 * Also sets apple-touch-icon if favicon_url is provided.
 * Falls back to default /favicon.ico if no favicon_url is set.
 *
 * Runs on mount and whenever tenantSlug changes.
 *
 * To avoid a flash of the default favicon before the tenant favicon loads,
 * use `generateFaviconPreloadMetadata()` in the server-side layout or page
 * metadata to preload the favicon in `<head>`.
 */
export default function TenantFavicon({ tenantSlug }: TenantFaviconProps) {
  const { config } = useTenant(tenantSlug);

  // Track previous favicon URL to avoid unnecessary DOM mutations
  const previousUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof document === 'undefined') return;

    const faviconUrl = config?.favicon_url || '/favicon.ico';

    // Skip if URL hasn't changed
    if (previousUrlRef.current === faviconUrl) return;
    previousUrlRef.current = faviconUrl;

    // Set standard favicon
    setFaviconLink('icon', faviconUrl);

    // Set apple-touch-icon (only if a tenant favicon is provided)
    if (config?.favicon_url) {
      setFaviconLink('apple-touch-icon', faviconUrl, '180x180');
    }

    // Also set shortcut icon for broader compatibility
    setFaviconLink('shortcut icon', faviconUrl);

  }, [config?.favicon_url]);

  // This component does not render any visible DOM.
  return null;
}

// ─── Helper ─────────────────────────────────────────────────────────────────

/**
 * Set or create a <link> element for the given rel type.
 *
 * @param rel    - Link rel value (e.g., 'icon', 'apple-touch-icon')
 * @param href   - URL for the href attribute
 * @param sizes  - Optional sizes attribute (e.g., '180x180')
 */
function setFaviconLink(
  rel: string,
  href: string,
  sizes?: string,
): void {
  const selector = sizes
    ? `link[rel="${rel}"][sizes="${sizes}"]`
    : `link[rel="${rel}"]`;

  let link = document.querySelector<HTMLLinkElement>(selector);

  if (!link) {
    link = document.createElement('link');
    link.rel = rel;
    if (sizes) link.sizes = sizes;
    document.head.appendChild(link);
  }

  link.href = href;
}
